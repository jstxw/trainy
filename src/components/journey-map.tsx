"use client";

import { useEffect, useRef, useState } from "react";
import { ArcLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import * as maplibregl from "maplibre-gl";
import {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  type IControl,
  type StyleSpecification,
} from "maplibre-gl";
import type { FeatureCollection, LineString, Point } from "geojson";
import type { Coordinate, JourneyLeg, Place } from "@/lib/domain";
import { journeyTooltip } from "@/lib/journey-tooltip";
import { railCoordinates, type RailPathStyle } from "@/lib/rail-path";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const EUROPE_CENTER: Coordinate = [10, 50.2];
const RAIL_SOURCE = "rail-journeys";
const PLACE_SOURCE = "journey-places";
const RAIL_SHADOW_LAYER = "rail-journey-shadow";
const PLACE_LAYER = "journey-place-markers";
const CARTO_TILE_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY;
const CARTO_TILE_QUERY = CARTO_TILE_KEY
  ? `?key=${encodeURIComponent(CARTO_TILE_KEY)}`
  : "";

// Keeping this style inline removes a second asynchronous style request. MapLibre
// still renders every tile and journey layer through WebGL.
const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "carto-light": {
      type: "raster",
      tiles: [
        `https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png${CARTO_TILE_QUERY}`,
        `https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png${CARTO_TILE_QUERY}`,
        `https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png${CARTO_TILE_QUERY}`,
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: "map-background",
      type: "background",
      paint: { "background-color": "#dfe1f7" },
    },
    {
      id: "carto-light-basemap",
      type: "raster",
      source: "carto-light",
      paint: {
        "raster-saturation": -0.75,
        "raster-contrast": -0.06,
        "raster-brightness-min": 0.16,
      },
    },
    {
      id: "map-lavender-tint",
      type: "background",
      paint: {
        "background-color": "#8d7bd8",
        "background-opacity": 0.24,
      },
    },
  ],
};

export type { RailPathStyle };

type RailProperties = {
  id: string;
  number: string;
};

type PlaceProperties = {
  id: string;
  name: string;
  mode: JourneyLeg["mode"];
  visits: number;
};

function railFeatures(
  legs: JourneyLeg[],
  pathStyle: RailPathStyle,
): FeatureCollection<LineString, RailProperties> {
  return {
    type: "FeatureCollection",
    features: legs
      .filter((leg) => leg.mode === "rail")
      .map((leg) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: railCoordinates(leg, pathStyle) },
        properties: { id: leg.id, number: leg.number },
      })),
  };
}

// Only boarded places feed this MapLibre layer; it renders beneath the deck.gl
// overlay, so pass-through calling points drawn here would hide under the track
// lines. Those are rendered by the "rail-calling-points" overlay layer instead.
function placeFeatures(legs: JourneyLeg[]): FeatureCollection<Point, PlaceProperties> {
  const places = new Map<string, { place: Place; mode: JourneyLeg["mode"]; visits: number }>();

  for (const leg of legs) {
    const legStops = leg.mode === "rail" && Array.isArray(leg.stops) && leg.stops.length > 0
      ? leg.stops.filter((stop) => stop.boarded)
      : [
          { place: leg.origin, boarded: true },
          { place: leg.destination, boarded: true },
        ];

    for (const stop of legStops) {
      const key = `${leg.mode}:${stop.place.id}`;
      const existing = places.get(key);
      places.set(key, { place: stop.place, mode: leg.mode, visits: (existing?.visits ?? 0) + 1 });
    }
  }

  return {
    type: "FeatureCollection",
    features: Array.from(places.values(), ({ place, mode, visits }) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: place.coordinates },
      properties: { id: place.id, name: place.name, mode, visits },
    })),
  };
}

function journeyOverlayLayers(
  legs: JourneyLeg[],
  selectedLegId: string | null,
  onSelectLeg: (id: string) => void,
  pathStyle: RailPathStyle,
) {
  const flights = legs.filter((leg) => leg.mode === "air");
  const railLegs = legs.filter((leg) => leg.mode === "rail");
  const railEndpoints = railLegs.flatMap((leg) => [
    { leg, coordinates: leg.origin.coordinates, name: leg.origin.name },
    { leg, coordinates: leg.destination.coordinates, name: leg.destination.name },
  ]);
  // Pass-through calling points sit on the routed track, so they only make
  // sense over the actual geometry — straight mode would leave them floating.
  const callingPoints = pathStyle === "actual"
    ? railLegs.flatMap((leg) =>
        (Array.isArray(leg.stops) ? leg.stops : [])
          .filter((stop) => !stop.boarded)
          .map((stop) => ({ leg, coordinates: stop.place.coordinates, name: stop.place.name })),
      )
    : [];

  return [
    new ArcLayer<JourneyLeg>({
      id: "flight-arcs",
      data: flights,
      greatCircle: true,
      getSourcePosition: (leg) => leg.origin.coordinates,
      getTargetPosition: (leg) => leg.destination.coordinates,
      getSourceColor: (leg) => selectedLegId && leg.id !== selectedLegId
        ? [128, 85, 232, 65]
        : [128, 85, 232, 245],
      getTargetColor: (leg) => selectedLegId && leg.id !== selectedLegId
        ? [128, 85, 232, 65]
        : [128, 85, 232, 245],
      getHeight: 0.1,
      getWidth: (leg) => leg.id === selectedLegId ? 4 : 2.5,
      numSegments: 64,
      widthUnits: "pixels",
      pickable: true,
      autoHighlight: true,
      highlightColor: [128, 85, 232, 90],
      onClick: ({ object }) => { if (object) onSelectLeg(object.id); },
      updateTriggers: {
        getSourceColor: selectedLegId,
        getTargetColor: selectedLegId,
        getWidth: selectedLegId,
      },
    }),
    new PathLayer<JourneyLeg>({
      id: "rail-route-shadow",
      data: railLegs,
      getPath: (leg) => railCoordinates(leg, pathStyle),
      getColor: (leg) => selectedLegId && leg.id !== selectedLegId
        ? [64, 70, 224, 18]
        : [64, 70, 224, 52],
      getWidth: (leg) => leg.id === selectedLegId ? 11 : 7,
      widthUnits: "pixels",
      capRounded: true,
      jointRounded: true,
      pickable: false,
      updateTriggers: { getColor: selectedLegId, getWidth: selectedLegId, getPath: pathStyle },
    }),
    new PathLayer<JourneyLeg>({
      id: "rail-routes",
      data: railLegs,
      getPath: (leg) => railCoordinates(leg, pathStyle),
      getColor: (leg) => selectedLegId && leg.id !== selectedLegId
        ? [64, 70, 224, 62]
        : [64, 70, 224, 255],
      getWidth: (leg) => leg.id === selectedLegId ? 5 : 2.5,
      widthUnits: "pixels",
      capRounded: true,
      jointRounded: true,
      pickable: true,
      autoHighlight: true,
      highlightColor: [64, 70, 224, 90],
      onClick: ({ object }) => { if (object) onSelectLeg(object.id); },
      updateTriggers: { getColor: selectedLegId, getWidth: selectedLegId, getPath: pathStyle },
    }),
    new ScatterplotLayer<{ leg: JourneyLeg; coordinates: Coordinate }>({
      id: "rail-calling-points",
      data: callingPoints,
      getPosition: ({ coordinates }) => coordinates,
      getRadius: ({ leg }) => leg.id === selectedLegId ? 3.5 : 2.5,
      radiusUnits: "pixels",
      getFillColor: ({ leg }) => selectedLegId && leg.id !== selectedLegId
        ? [255, 255, 255, 60]
        : [255, 255, 255, 220],
      getLineColor: [37, 43, 99, 185],
      getLineWidth: 1,
      lineWidthUnits: "pixels",
      stroked: true,
      pickable: true,
      onClick: ({ object }) => { if (object) onSelectLeg(object.leg.id); },
      updateTriggers: { getFillColor: selectedLegId, getRadius: selectedLegId },
    }),
    new ScatterplotLayer<{ leg: JourneyLeg; coordinates: Coordinate }>({
      id: "rail-endpoints",
      data: railEndpoints,
      getPosition: ({ coordinates }) => coordinates,
      getRadius: 5,
      radiusUnits: "pixels",
      getFillColor: [255, 255, 255, 245],
      getLineColor: ({ leg }) => selectedLegId && leg.id !== selectedLegId
        ? [64, 70, 224, 65]
        : [64, 70, 224, 255],
      getLineWidth: ({ leg }) => leg.id === selectedLegId ? 3 : 2,
      lineWidthUnits: "pixels",
      stroked: true,
      pickable: true,
      onClick: ({ object }) => { if (object) onSelectLeg(object.leg.id); },
      updateTriggers: { getLineColor: selectedLegId, getLineWidth: selectedLegId },
    }),
  ];
}

function fitJourneys(
  map: MapLibreMap,
  legs: JourneyLeg[],
  selectedLegId: string | null,
  sidebarOpen: boolean,
  pathStyle: RailPathStyle,
) {
  if (legs.length === 0) {
    map.jumpTo({ center: EUROPE_CENTER, zoom: 4 });
    return;
  }

  const bounds = new LngLatBounds();
  const selectedLeg = legs.find((leg) => leg.id === selectedLegId);
  const legsToFit = selectedLeg ? [selectedLeg] : legs;
  for (const leg of legsToFit) {
    const coordinates = leg.mode === "rail"
      ? railCoordinates(leg, pathStyle)
      : [leg.origin.coordinates, leg.destination.coordinates];
    for (const coordinate of coordinates) bounds.extend(coordinate);
  }

  if (!bounds.isEmpty()) {
    const compact = window.innerWidth <= 760;
    map.fitBounds(bounds, {
      padding: compact && sidebarOpen
        ? { top: 70, right: 42, bottom: 360, left: 42 }
        : { top: 76, right: 76, bottom: 76, left: sidebarOpen ? 520 : 76 },
      maxZoom: selectedLeg ? 9 : 7,
      duration: 600,
    });
  }
}

function updateJourneys(
  map: MapLibreMap,
  overlay: MapboxOverlay,
  legs: JourneyLeg[],
  selectedLegId: string | null,
  sidebarOpen: boolean,
  pathStyle: RailPathStyle,
  onSelectLeg: (id: string) => void,
) {
  const railSource = map.getSource(RAIL_SOURCE);
  const placeSource = map.getSource(PLACE_SOURCE);

  (railSource as GeoJSONSource | undefined)?.setData(railFeatures(legs, pathStyle));
  (placeSource as GeoJSONSource | undefined)?.setData(placeFeatures(legs));
  overlay.setProps({
    layers: journeyOverlayLayers(legs, selectedLegId, onSelectLeg, pathStyle),
    getTooltip: journeyTooltip,
  });
  fitJourneys(map, legs, selectedLegId, sidebarOpen, pathStyle);
}

function addJourneyLayers(map: MapLibreMap) {
  map.addSource(RAIL_SOURCE, { type: "geojson", data: railFeatures([], "actual") });
  map.addSource(PLACE_SOURCE, { type: "geojson", data: placeFeatures([]) });

  map.addLayer({
    id: RAIL_SHADOW_LAYER,
    type: "line",
    source: RAIL_SOURCE,
    paint: {
      "line-color": "#b9bdf0",
      "line-width": ["interpolate", ["linear"], ["zoom"], 2, 5, 8, 8],
      "line-opacity": 0.45,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: PLACE_LAYER,
    type: "circle",
    source: PLACE_SOURCE,
    paint: {
      "circle-radius": ["+", 3, ["*", 1.3, ["sqrt", ["get", "visits"]]]],
      "circle-color": "#ffffff",
      "circle-opacity": 0.82,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": [
        "match",
        ["get", "mode"],
        "air",
        "#8055e8",
        "#4046e0",
      ],
    },
  });
}

export default function JourneyMap({
  legs,
  selectedLegId = null,
  onSelectLeg,
  sidebarOpen = true,
  railPathStyle = "actual",
}: {
  legs: JourneyLeg[];
  selectedLegId?: string | null;
  onSelectLeg?: (id: string) => void;
  sidebarOpen?: boolean;
  railPathStyle?: RailPathStyle;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const legsRef = useRef(legs);
  const selectedLegIdRef = useRef(selectedLegId);
  const sidebarOpenRef = useRef(sidebarOpen);
  const railPathStyleRef = useRef(railPathStyle);
  const onSelectLegRef = useRef(onSelectLeg);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    legsRef.current = legs;
    selectedLegIdRef.current = selectedLegId;
    sidebarOpenRef.current = sidebarOpen;
    railPathStyleRef.current = railPathStyle;
    onSelectLegRef.current = onSelectLeg;
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (map && overlay && map.getSource(RAIL_SOURCE)) {
      updateJourneys(map, overlay, legs, selectedLegId, sidebarOpen, railPathStyle, (id) => onSelectLegRef.current?.(id));
    }
  }, [legs, onSelectLeg, railPathStyle, selectedLegId, sidebarOpen]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container,
        style: MAP_STYLE,
        center: EUROPE_CENTER,
        zoom: 4,
        minZoom: 2,
        maxZoom: 18,
      });
    } catch {
      queueMicrotask(() => setMapError("WebGL could not start in this browser."));
      return;
    }

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: journeyOverlayLayers([], null, (id) => onSelectLegRef.current?.(id), railPathStyleRef.current),
      getTooltip: journeyTooltip,
    });
    mapRef.current = map;
    overlayRef.current = overlay;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(overlay as unknown as IControl);

    map.once("load", () => {
      addJourneyLayers(map);
      updateJourneys(
        map,
        overlay,
        legsRef.current,
        selectedLegIdRef.current,
        sidebarOpenRef.current,
        railPathStyleRef.current,
        (id) => onSelectLegRef.current?.(id),
      );
      requestAnimationFrame(() => map.resize());
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);
    requestAnimationFrame(() => map.resize());

    return () => {
      resizeObserver.disconnect();
      overlayRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  if (mapError) {
    return (
      <div className="map-error" role="alert">
        <strong>The WebGL map could not load.</strong>
        <span>{mapError} Check hardware acceleration and reload the page.</span>
      </div>
    );
  }

  return <div ref={containerRef} className="journey-map" />;
}
