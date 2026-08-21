"use client";

import { useEffect, useRef, useState } from "react";
import { ArcLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import * as maplibregl from "maplibre-gl";
import {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  Popup,
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
const RAIL_LAYER = "rail-journey-lines";
const PLACE_LAYER = "journey-place-markers";

// Keeping this style inline removes a second asynchronous style request. MapLibre
// still renders every tile and journey layer through WebGL.
const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "carto-light": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
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
      paint: { "background-color": "#e4e8df" },
    },
    {
      id: "carto-light-basemap",
      type: "raster",
      source: "carto-light",
      paint: {
        "raster-saturation": -0.55,
        "raster-contrast": -0.06,
        "raster-brightness-min": 0.08,
        "raster-brightness-max": 0.96,
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
  const coordinates = leg.geometry.filter(
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
  const places = new Map<string, { place: Place; mode: JourneyLeg["mode"] }>();

  for (const leg of legs) {
    const legPlaces = leg.mode === "rail" && leg.stops.length > 0
      ? leg.stops.map((stop) => stop.place)
      : [leg.origin, leg.destination];

    for (const place of legPlaces) {
      places.set(`${leg.mode}:${place.id}`, { place, mode: leg.mode });
    }
  }

  return {
    type: "FeatureCollection",
    features: Array.from(places.values(), ({ place, mode }) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: place.coordinates },
      properties: { id: place.id, name: place.name, mode },
    })),
  };
}

function popupContent(leg: JourneyLeg) {
  const content = document.createElement("div");
  content.className = "map-popup";

  const number = document.createElement("strong");
  number.textContent = leg.number;
  const route = document.createElement("span");
  route.textContent = `${leg.origin.city} → ${leg.destination.city}`;
  const distance = document.createElement("small");
  distance.textContent = `${leg.distanceKm.toLocaleString("en-GB")} km · ${leg.travelDate}`;
  content.append(number, route, distance);

  return content;
}

function showLegPopup(map: MapLibreMap, leg: JourneyLeg, coordinates: Coordinate) {
  new Popup({ closeButton: false, offset: 10 })
    .setLngLat(coordinates)
    .setDOMContent(popupContent(leg))
    .addTo(map);
}

function flightLayers(map: MapLibreMap, legs: JourneyLeg[]) {
  const flights = legs.filter((leg) => leg.mode === "air");

  return [
    new ArcLayer<JourneyLeg>({
      id: "flight-arcs",
      data: flights,
      greatCircle: true,
      getSourcePosition: (leg) => leg.origin.coordinates,
      getTargetPosition: (leg) => leg.destination.coordinates,
      getSourceColor: [214, 133, 62, 230],
      getTargetColor: [214, 133, 62, 230],
      getHeight: 0.18,
      getWidth: 3,
      numSegments: 64,
      widthUnits: "pixels",
      pickable: true,
      autoHighlight: true,
      highlightColor: [23, 62, 53, 90],
      onClick: ({ object, coordinate }) => {
        if (object && coordinate) {
          showLegPopup(map, object, [coordinate[0], coordinate[1]]);
        }
      },
    }),
  ];
}

function fitJourneys(map: MapLibreMap, legs: JourneyLeg[]) {
  if (legs.length === 0) {
    map.jumpTo({ center: EUROPE_CENTER, zoom: 4 });
    return;
  }

  const bounds = new LngLatBounds();
  for (const leg of legs) {
    const coordinates = leg.mode === "rail"
      ? railCoordinates(leg)
      : [leg.origin.coordinates, leg.destination.coordinates];
    for (const coordinate of coordinates) bounds.extend(coordinate);
  }

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, {
      padding: { top: 68, right: 58, bottom: 68, left: 58 },
      maxZoom: 7,
      duration: 500,
    });
  }
}

function updateJourneys(map: MapLibreMap, overlay: MapboxOverlay, legs: JourneyLeg[]) {
  const railSource = map.getSource(RAIL_SOURCE);
  const placeSource = map.getSource(PLACE_SOURCE);

  (railSource as GeoJSONSource | undefined)?.setData(railFeatures(legs));
  (placeSource as GeoJSONSource | undefined)?.setData(placeFeatures(legs));
  overlay.setProps({ layers: flightLayers(map, legs) });
  fitJourneys(map, legs);
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
      "line-width": ["interpolate", ["linear"], ["zoom"], 2, 7, 8, 11],
      "line-opacity": 0.18,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: RAIL_LAYER,
    type: "line",
    source: RAIL_SOURCE,
    paint: {
      "line-color": "#167b64",
      "line-width": ["interpolate", ["linear"], ["zoom"], 2, 3.5, 8, 5],
      "line-opacity": 1,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: PLACE_LAYER,
    type: "circle",
    source: PLACE_SOURCE,
    paint: {
      "circle-radius": 4.5,
      "circle-color": "#fbfaf6",
      "circle-stroke-width": 2,
      "circle-stroke-color": [
        "match",
        ["get", "mode"],
        "air",
        "#d6853e",
        "#167b64",
      ],
    },
  });
}

export default function JourneyMap({ legs }: { legs: JourneyLeg[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const legsRef = useRef(legs);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    legsRef.current = legs;
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (map && overlay && map.getSource(RAIL_SOURCE)) {
      updateJourneys(map, overlay, legs);
    }
  }, [legs]);

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
      layers: flightLayers(map, []),
    });
    mapRef.current = map;
    overlayRef.current = overlay;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(overlay as unknown as IControl);

    map.once("load", () => {
      addJourneyLayers(map);
      updateJourneys(map, overlay, legsRef.current);
      requestAnimationFrame(() => map.resize());
    });

    map.on("click", RAIL_LAYER, (event) => {
      const id = event.features?.[0]?.properties?.id;
      const leg = legsRef.current.find((candidate) => candidate.id === id);
      if (leg) showLegPopup(map, leg, [event.lngLat.lng, event.lngLat.lat]);
    });
    map.on("mouseenter", RAIL_LAYER, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", RAIL_LAYER, () => {
      map.getCanvas().style.cursor = "";
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
