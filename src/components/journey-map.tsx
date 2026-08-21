"use client";

import { useEffect, useRef, useState } from "react";
import { ArcLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import * as maplibregl from "maplibre-gl";
import type {
  GeoJSONSource,
  IControl,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
import type { JourneyLeg } from "@/lib/domain";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

function railGeoJson(legs: JourneyLeg[]) {
  return {
    type: "FeatureCollection" as const,
    features: legs
      .filter((leg) => leg.mode === "rail")
      .map((leg) => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: leg.geometry,
        },
        properties: {
          id: leg.id,
          number: leg.number,
          operator: leg.operator,
          origin: leg.origin.city,
          destination: leg.destination.city,
          distanceKm: leg.distanceKm,
        },
      })),
  };
}

function stationGeoJson(legs: JourneyLeg[]) {
  const seen = new Set<string>();
  const features = legs
    .filter((leg) => leg.mode === "rail")
    .flatMap((leg) => leg.stops)
    .filter((stop) => {
      if (seen.has(stop.place.id)) return false;
      seen.add(stop.place.id);
      return true;
    })
    .map((stop) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: stop.place.coordinates,
      },
      properties: {
        name: stop.place.name,
      },
    }));

  return { type: "FeatureCollection" as const, features };
}

function flightLayers(legs: JourneyLeg[]) {
  const flights = legs.filter((leg) => leg.mode === "air");

  return [
    new ArcLayer<JourneyLeg>({
      id: "flight-arcs",
      data: flights,
      getSourcePosition: (leg) => leg.origin.coordinates,
      getTargetPosition: (leg) => leg.destination.coordinates,
      getSourceColor: [214, 133, 62, 210],
      getTargetColor: [214, 133, 62, 210],
      getWidth: 3,
      getHeight: 0.25,
      greatCircle: true,
      pickable: true,
    }),
  ];
}

function fitToJourneys(map: MapLibreMap, legs: JourneyLeg[], duration = 0) {
  const bounds = new maplibregl.LngLatBounds();

  for (const leg of legs) {
    for (const coordinate of leg.geometry) bounds.extend(coordinate);
  }

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, {
      padding: { top: 80, right: 60, bottom: 72, left: 60 },
      duration,
      maxZoom: 5.7,
    });
  }
}

function StaticMapFallback({ legs }: { legs: JourneyLeg[] }) {
  const toPoint = ([longitude, latitude]: [number, number]) => ({
    x: ((longitude + 2) / 22) * 1000,
    y: ((56 - latitude) / 15) * 600,
  });

  return (
    <div className="static-map" role="img" aria-label="Static map of the visible journeys">
      <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
        <g className="static-map__grid">
          {[100, 250, 400, 550, 700, 850].map((x) => <line key={`x-${x}`} x1={x} y1="0" x2={x} y2="600" />)}
          {[100, 220, 340, 460].map((y) => <line key={`y-${y}`} x1="0" y1={y} x2="1000" y2={y} />)}
        </g>
        {legs.map((leg) => (
          <polyline
            key={leg.id}
            className={`static-map__route static-map__route--${leg.mode}`}
            points={leg.geometry.map((coordinate) => {
              const point = toPoint(coordinate);
              return `${point.x},${point.y}`;
            }).join(" ")}
          />
        ))}
        {legs.flatMap((leg) => leg.mode === "rail" ? leg.stops : []).map((stop) => {
          const point = toPoint(stop.place.coordinates);
          return <circle key={`${stop.place.id}-${stop.sequence}`} cx={point.x} cy={point.y} r="4" />;
        })}
      </svg>
      <div className="static-map__notice">Interactive map needs WebGL 2</div>
    </div>
  );
}

export default function JourneyMap({ legs }: { legs: JourneyLeg[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const legsRef = useRef(legs);
  const [mapUnavailable, setMapUnavailable] = useState(false);

  useEffect(() => {
    legsRef.current = legs;

    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;

    (map.getSource("rail-journeys") as GeoJSONSource | undefined)?.setData(
      railGeoJson(legs),
    );
    (map.getSource("rail-stations") as GeoJSONSource | undefined)?.setData(
      stationGeoJson(legs),
    );
    overlayRef.current?.setProps({ layers: flightLayers(legs) });
    fitToJourneys(map, legs, 450);
  }, [legs]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: MapLibreMap;

    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [8.8, 49.7],
        zoom: 4.15,
        minZoom: 2.5,
        maxZoom: 13,
        attributionControl: false,
        cooperativeGestures: true,
      });
    } catch {
      queueMicrotask(() => setMapUnavailable(true));
      return;
    }

    if (!map.getCanvas().getContext("webgl2")) {
      try {
        map.remove();
      } catch {
        // The context never initialized, so MapLibre may have nothing to remove.
      }
      queueMicrotask(() => setMapUnavailable(true));
      return;
    }

    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left",
    );

    map.on("load", () => {
      map.addSource("rail-journeys", {
        type: "geojson",
        data: railGeoJson(legsRef.current),
      });

      map.addLayer({
        id: "rail-shadow",
        type: "line",
        source: "rail-journeys",
        paint: {
          "line-color": "#173e35",
          "line-opacity": 0.15,
          "line-width": 7,
          "line-blur": 4,
        },
      });

      map.addLayer({
        id: "rail-lines",
        type: "line",
        source: "rail-journeys",
        paint: {
          "line-color": "#167b64",
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2.2, 8, 4.5],
          "line-opacity": 0.92,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });

      map.addSource("rail-stations", {
        type: "geojson",
        data: stationGeoJson(legsRef.current),
      });

      map.addLayer({
        id: "station-dots",
        type: "circle",
        source: "rail-stations",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2.8, 8, 5.5],
          "circle-color": "#f8f5ed",
          "circle-stroke-color": "#126a57",
          "circle-stroke-width": 2,
        },
      });

      const overlay = new MapboxOverlay({
        interleaved: true,
        layers: flightLayers(legsRef.current),
      });
      overlayRef.current = overlay;
      map.addControl(overlay as unknown as IControl);

      fitToJourneys(map, legsRef.current);
    });

    map.on("mouseenter", "rail-lines", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "rail-lines", () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("click", "rail-lines", (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature?.properties) return;

      const content = document.createElement("div");
      content.className = "map-popup";

      const number = document.createElement("strong");
      number.textContent = String(feature.properties.number);
      const route = document.createElement("span");
      route.textContent = `${feature.properties.origin} → ${feature.properties.destination}`;
      const distance = document.createElement("small");
      distance.textContent = `${Number(feature.properties.distanceKm).toLocaleString("en-GB")} km`;
      content.append(number, route, distance);

      new maplibregl.Popup({ offset: 14, closeButton: false })
        .setLngLat(event.lngLat)
        .setDOMContent(content)
        .addTo(map);
    });

    return () => {
      overlayRef.current = null;
      mapRef.current = null;
      try {
        map.remove();
      } catch {
        // A browser can lose its WebGL context between construction and cleanup.
      }
    };
  }, []);

  if (mapUnavailable) return <StaticMapFallback legs={legs} />;
  return <div ref={containerRef} className="journey-map" />;
}
