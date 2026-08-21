"use client";

import { useEffect, useRef } from "react";
import * as L from "leaflet";
import type { Coordinate, JourneyLeg } from "@/lib/domain";

const EUROPE_CENTER: L.LatLngExpression = [50.2, 10];

function toLatLng([longitude, latitude]: Coordinate): L.LatLngTuple {
  return [latitude, longitude];
}

function greatCirclePoints(origin: Coordinate, destination: Coordinate, steps = 64) {
  const toVector = ([longitude, latitude]: Coordinate) => {
    const longitudeRadians = longitude * (Math.PI / 180);
    const latitudeRadians = latitude * (Math.PI / 180);
    return [
      Math.cos(latitudeRadians) * Math.cos(longitudeRadians),
      Math.cos(latitudeRadians) * Math.sin(longitudeRadians),
      Math.sin(latitudeRadians),
    ];
  };
  const fromVector = ([x, y, z]: number[]): L.LatLngTuple => [
    Math.atan2(z, Math.sqrt(x * x + y * y)) * (180 / Math.PI),
    Math.atan2(y, x) * (180 / Math.PI),
  ];

  const start = toVector(origin);
  const end = toVector(destination);
  const dot = Math.min(1, Math.max(-1, start.reduce((sum, value, index) => sum + value * end[index], 0)));
  const angle = Math.acos(dot);

  if (angle < 0.000001) return [toLatLng(origin), toLatLng(destination)];

  const angleSine = Math.sin(angle);
  return Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps;
    const startWeight = Math.sin((1 - progress) * angle) / angleSine;
    const endWeight = Math.sin(progress * angle) / angleSine;
    return fromVector(start.map((value, vectorIndex) =>
      value * startWeight + end[vectorIndex] * endWeight,
    ));
  });
}

function popupFor(leg: JourneyLeg) {
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

function renderJourneys(map: L.Map, journeyLayer: L.FeatureGroup, legs: JourneyLeg[]) {
  journeyLayer.clearLayers();
  const renderedPlaces = new Set<string>();

  for (const leg of legs) {
    const color = leg.mode === "rail" ? "#167b64" : "#d6853e";
    const points = leg.mode === "air"
      ? greatCirclePoints(leg.origin.coordinates, leg.destination.coordinates)
      : leg.geometry.map(toLatLng);

    L.polyline(points, {
      color: leg.mode === "rail" ? "#173e35" : "#8f5b2d",
      weight: leg.mode === "rail" ? 8 : 6,
      opacity: 0.12,
      interactive: false,
    }).addTo(journeyLayer);

    L.polyline(points, {
      color,
      weight: leg.mode === "rail" ? 3.5 : 3,
      opacity: 0.94,
      dashArray: leg.mode === "air" ? "8 8" : undefined,
      lineCap: "round",
      lineJoin: "round",
    })
      .bindPopup(popupFor(leg), { closeButton: false, offset: [0, -4] })
      .addTo(journeyLayer);

    const places = leg.mode === "rail"
      ? leg.stops.map((stop) => stop.place)
      : [leg.origin, leg.destination];

    for (const place of places) {
      if (renderedPlaces.has(place.id)) continue;
      renderedPlaces.add(place.id);

      L.circleMarker(toLatLng(place.coordinates), {
        radius: 4.5,
        color,
        weight: 2,
        fillColor: "#fbfaf6",
        fillOpacity: 1,
      })
        .bindTooltip(place.name, { direction: "top", offset: [0, -6] })
        .addTo(journeyLayer);
    }
  }

  if (legs.length > 0) {
    const bounds = journeyLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        paddingTopLeft: [58, 68],
        paddingBottomRight: [58, 68],
        maxZoom: 7,
        animate: true,
        duration: 0.5,
      });
    }
  } else {
    map.setView(EUROPE_CENTER, 4, { animate: false });
  }
}

export default function JourneyMap({ legs }: { legs: JourneyLeg[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const journeyLayerRef = useRef<L.FeatureGroup | null>(null);
  const legsRef = useRef(legs);

  useEffect(() => {
    legsRef.current = legs;
    if (mapRef.current && journeyLayerRef.current) {
      renderJourneys(mapRef.current, journeyLayerRef.current, legs);
    }
  }, [legs]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: EUROPE_CENTER,
      zoom: 4,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      crossOrigin: true,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    const journeyLayer = L.featureGroup().addTo(map);
    mapRef.current = map;
    journeyLayerRef.current = journeyLayer;
    renderJourneys(map, journeyLayer, legsRef.current);

    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(containerRef.current);
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));

    return () => {
      resizeObserver.disconnect();
      journeyLayerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  return <div ref={containerRef} className="journey-map" />;
}
