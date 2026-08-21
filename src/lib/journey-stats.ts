import type { JourneyLeg, TravelStats } from "./domain.ts";

export function calculateJourneyStats(legs: JourneyLeg[]): TravelStats {
  const countries = new Set<string>();
  const places = new Set<string>();
  const monthCounts = new Map<string, number>();
  const dates = legs.map((leg) => leg.travelDate).sort((first, second) => first.localeCompare(second));

  for (const leg of legs) {
    for (const stop of leg.stops) {
      countries.add(stop.place.country);
      places.add(stop.place.id);
    }

    const month = leg.travelDate.slice(0, 7);
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
  }

  const busiestMonth = Array.from(monthCounts)
    .sort(([firstMonth, firstCount], [secondMonth, secondCount]) =>
      secondCount - firstCount || firstMonth.localeCompare(secondMonth),
    )[0];

  return {
    journeys: legs.length,
    distanceKm: legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
    countries: countries.size,
    places: places.size,
    railJourneys: legs.filter((leg) => leg.mode === "rail").length,
    airJourneys: legs.filter((leg) => leg.mode === "air").length,
    firstTripDate: dates[0] ?? null,
    lastTripDate: dates.at(-1) ?? null,
    busiestMonth: busiestMonth
      ? { month: busiestMonth[0], journeys: busiestMonth[1] }
      : null,
  };
}
