"use client";

import dynamic from "next/dynamic";
import type { JourneyLeg } from "@/lib/domain";
import type { RailPathStyle } from "@/lib/rail-path";

export type MapView = "map" | "planet";

const JourneyMap = dynamic(() => import("@/components/journey-map"), {
  ssr: false,
  loading: () => (
    <div className="map-loading" aria-label="Loading journey map">
      <span className="map-loading__mark" />
      <span>Drawing your journeys…</span>
    </div>
  ),
});

const PlanetGlobe = dynamic(() => import("@/components/planet-globe"), {
  ssr: false,
  loading: () => (
    <div className="map-loading map-loading--planet" aria-label="Loading journey planet">
      <span className="map-loading__mark" />
      <span>Shaping your planet…</span>
    </div>
  ),
});

export function MapShell({
  legs,
  selectedLegId,
  onSelectLeg,
  sidebarOpen,
  railPathStyle,
  view = "map",
  continuousRotation = false,
}: {
  legs: JourneyLeg[];
  selectedLegId?: string | null;
  onSelectLeg?: (id: string) => void;
  sidebarOpen?: boolean;
  railPathStyle?: RailPathStyle;
  view?: MapView;
  continuousRotation?: boolean;
}) {
  if (view === "planet") {
    return (
      <PlanetGlobe
        legs={legs}
        selectedLegId={selectedLegId}
        onSelectLeg={onSelectLeg}
        sidebarOpen={sidebarOpen}
        railPathStyle={railPathStyle}
        continuousRotation={continuousRotation}
      />
    );
  }

  return (
    <JourneyMap
      legs={legs}
      selectedLegId={selectedLegId}
      onSelectLeg={onSelectLeg}
      sidebarOpen={sidebarOpen}
      railPathStyle={railPathStyle}
    />
  );
}
