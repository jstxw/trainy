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

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const EUROPE_CENTER: Coordinate = [10, 50.2];
const RAIL_SOURCE = "rail-journeys";
const PLACE_SOURCE = "journey-places";
const RAIL_SHADOW_LAYER = "rail-journey-shadow";
const PLACE_LAYER = "journey-place-markers";

// Keeping this style inline removes a second asynchronous style request. MapLibre
// still renders every tile and journey layer through WebGL.
const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "carto-dark": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
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
      paint: { "background-color": "#0b0d0f" },
    },
    {
      id: "carto-dark-basemap",
      type: "raster",
      source: "carto-dark",
      paint: {
        "raster-saturation": -1,
        "raster-contrast": -0.12,
        "raster-brightness-min": 0.04,
        "raster-brightness-max": 0.72,
      },
    },
  ],
};

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

function railFeatures(legs: JourneyLeg[]): FeatureCollection<LineString, RailProperties> {
  return {
    type: "FeatureCollection",
    features: legs
      .filter((leg) => leg.mode === "rail")
      .map((leg) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: railCoordinates(leg) },
        properties: { id: leg.id, number: leg.number },
      })),
  };
}

function railCoordinates(leg: JourneyLeg): Coordinate[] {
  const coordinates = (Array.isArray(leg.geometry) ? leg.geometry : []).filter(
    (coordinate): coordinate is Coordinate =>
      Array.isArray(coordinate) &&
      coordinate.length === 2 &&
      coordinate.every((value) => Number.isFinite(value)),
  );

  return coordinates.length >= 2
    ? coordinates
    : [leg.origin.coordinates, leg.destination.coordinates];
}

function placeFeatures(legs: JourneyLeg[]): FeatureCollection<Point, PlaceProperties> {
  const places = new Map<string, { place: Place; mode: JourneyLeg["mode"]; visits: number }>();

  for (const leg of legs) {
    const legPlaces = leg.mode === "rail" && Array.isArray(leg.stops) && leg.stops.length > 0
      ? leg.stops.map((stop) => stop.place)
      : [leg.origin, leg.destination];

    for (const place of legPlaces) {
      const key = `${leg.mode}:${place.id}`;
      const existing = places.get(key);
      places.set(key, { place, mode: leg.mode, visits: (existing?.visits ?? 0) + 1 });
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
) {
  const flights = legs.filter((leg) => leg.mode === "air");
  const railLegs = legs.filter((leg) => leg.mode === "rail");
  const railEndpoints = railLegs.flatMap((leg) => [
    { leg, coordinates: leg.origin.coordinates },
    { leg, coordinates: leg.destination.coordinates },
  ]);

  return [
    new ArcLayer<JourneyLeg>({
      id: "flight-arcs",
      data: flights,
      greatCircle: true,
      getSourcePosition: (leg) => leg.origin.coordinates,
      getTargetPosition: (leg) => leg.destination.coordinates,
      getSourceColor: (leg) => selectedLegId && leg.id !== selectedLegId
        ? [232, 151, 58, 65]
        : [232, 151, 58, 245],
      getTargetColor: (leg) => selectedLegId && leg.id !== selectedLegId
        ? [232, 151, 58, 65]
        : [232, 151, 58, 245],
      getHeight: 0.1,
      getWidth: (leg) => leg.id === selectedLegId ? 4 : 2.5,
      numSegments: 64,
      widthUnits: "pixels",
      pickable: true,
      autoHighlight: true,
      highlightColor: [232, 151, 58, 90],
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
      getPath: railCoordinates,
      getColor: (leg) => selectedLegId && leg.id !== selectedLegId
        ? [47, 191, 113, 18]
        : [47, 191, 113, 52],
      getWidth: (leg) => leg.id === selectedLegId ? 11 : 7,
      widthUnits: "pixels",
      capRounded: true,
      jointRounded: true,
      pickable: false,
      updateTriggers: { getColor: selectedLegId, getWidth: selectedLegId },
    }),
    new PathLayer<JourneyLeg>({
      id: "rail-routes",
      data: railLegs,
      getPath: railCoordinates,
      getColor: (leg) => selectedLegId && leg.id !== selectedLegId
        ? [47, 191, 113, 62]
        : [47, 191, 113, 255],
      getWidth: (leg) => leg.id === selectedLegId ? 5 : 2.5,
      widthUnits: "pixels",
      capRounded: true,
      jointRounded: true,
      pickable: true,
      autoHighlight: true,
      highlightColor: [47, 191, 113, 90],
      onClick: ({ object }) => { if (object) onSelectLeg(object.id); },
      updateTriggers: { getColor: selectedLegId, getWidth: selectedLegId },
    }),
    new ScatterplotLayer<{ leg: JourneyLeg; coordinates: Coordinate }>({
      id: "rail-endpoints",
      data: railEndpoints,
      getPosition: ({ coordinates }) => coordinates,
      getRadius: 5,
      radiusUnits: "pixels",
      getFillColor: [242, 240, 236, 245],
      getLineColor: ({ leg }) => selectedLegId && leg.id !== selectedLegId
        ? [47, 191, 113, 65]
        : [47, 191, 113, 255],
      getLineWidth: ({ leg }) => leg.id === selectedLegId ? 3 : 2,
      lineWidthUnits: "pixels",
      stroked: true,
      pickable: true,
      onClick: ({ object }) => { if (object) onSelectLeg(object.leg.id); },
      updateTriggers: { getLineColor: selectedLegId, getLineWidth: selectedLegId },
    }),
  ];
}

function fitJourneys(map: MapLibreMap, legs: JourneyLeg[], selectedLegId: string | null) {
  if (legs.length === 0) {
    map.jumpTo({ center: EUROPE_CENTER, zoom: 4 });
    return;
  }

  const bounds = new LngLatBounds();
  const selectedLeg = legs.find((leg) => leg.id === selectedLegId);
  const legsToFit = selectedLeg ? [selectedLeg] : legs;
  for (const leg of legsToFit) {
    const coordinates = leg.mode === "rail"
      ? railCoordinates(leg)
      : [leg.origin.coordinates, leg.destination.coordinates];
    for (const coordinate of coordinates) bounds.extend(coordinate);
  }

  if (!bounds.isEmpty()) {
    const compact = window.innerWidth <= 760;
    map.fitBounds(bounds, {
      padding: compact
        ? { top: 70, right: 42, bottom: 360, left: 42 }
        : { top: 76, right: 76, bottom: 76, left: 520 },
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
  onSelectLeg: (id: string) => void,
) {
  const railSource = map.getSource(RAIL_SOURCE);
  const placeSource = map.getSource(PLACE_SOURCE);

  (railSource as GeoJSONSource | undefined)?.setData(railFeatures(legs));
  (placeSource as GeoJSONSource | undefined)?.setData(placeFeatures(legs));
  overlay.setProps({ layers: journeyOverlayLayers(legs, selectedLegId, onSelectLeg) });
  fitJourneys(map, legs, selectedLegId);
}

function addJourneyLayers(map: MapLibreMap) {
  map.addSource(RAIL_SOURCE, { type: "geojson", data: railFeatures([]) });
  map.addSource(PLACE_SOURCE, { type: "geojson", data: placeFeatures([]) });

  map.addLayer({
    id: RAIL_SHADOW_LAYER,
    type: "line",
    source: RAIL_SOURCE,
    paint: {
      "line-color": "#173e35",
      "line-width": ["interpolate", ["linear"], ["zoom"], 2, 5, 8, 8],
      "line-opacity": 0.2,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: PLACE_LAYER,
    type: "circle",
    source: PLACE_SOURCE,
    paint: {
      "circle-radius": ["+", 3, ["*", 1.3, ["sqrt", ["get", "visits"]]]],
      "circle-color": "#f2f0ec",
      "circle-opacity": 0.82,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": [
        "match",
        ["get", "mode"],
        "air",
        "#e8973a",
        "#2fbf71",
      ],
    },
  });
}

export default function JourneyMap({
  legs,
  selectedLegId = null,
  onSelectLeg,
}: {
  legs: JourneyLeg[];
  selectedLegId?: string | null;
  onSelectLeg?: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const legsRef = useRef(legs);
  const selectedLegIdRef = useRef(selectedLegId);
  const onSelectLegRef = useRef(onSelectLeg);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    legsRef.current = legs;
    selectedLegIdRef.current = selectedLegId;
    onSelectLegRef.current = onSelectLeg;
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (map && overlay && map.getSource(RAIL_SOURCE)) {
      updateJourneys(map, overlay, legs, selectedLegId, (id) => onSelectLegRef.current?.(id));
    }
  }, [legs, onSelectLeg, selectedLegId]);

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
      layers: journeyOverlayLayers([], null, (id) => onSelectLegRef.current?.(id)),
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
