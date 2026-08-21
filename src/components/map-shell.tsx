"use client";

import dynamic from "next/dynamic";
import type { JourneyLeg } from "@/lib/domain";

const JourneyMap = dynamic(() => import("@/components/journey-map"), {
  ssr: false,
  loading: () => (
    <div className="map-loading" aria-label="Loading journey map">
      <span className="map-loading__mark" />
      <span>Drawing your journeys…</span>
    </div>
  ),
});

export function MapShell({
  legs,
  selectedLegId,
  onSelectLeg,
}: {
  legs: JourneyLeg[];
  selectedLegId?: string | null;
  onSelectLeg?: (id: string) => void;
}) {
  return (
    <JourneyMap
      legs={legs}
      selectedLegId={selectedLegId}
      onSelectLeg={onSelectLeg}
    />
  );
}
