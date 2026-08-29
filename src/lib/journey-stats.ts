import type { JourneyLeg, TravelStats } from "./domain.ts";
import { estimatedFlightMinutes } from "./journey-distance.ts";

export function calculateJourneyStats(legs: JourneyLeg[]): TravelStats {
  const countries = new Set<string>();
  const places = new Set<string>();
  const railStations = new Set<string>();
  const railOperators = new Set<string>();
  const operators = new Set<string>();
  const monthCounts = new Map<string, number>();
  const dates = legs.map((leg) => leg.travelDate).sort((first, second) => first.localeCompare(second));

  for (const leg of legs) {
    for (const stop of leg.stops) {
      if (!stop.boarded) continue;
      countries.add(stop.place.country);
      places.add(stop.place.id);
    }

    const month = leg.travelDate.slice(0, 7);
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);

    if (leg.operator.trim()) operators.add(leg.operator.trim().toLocaleLowerCase());

    if (leg.mode === "rail") {
      for (const stop of leg.stops.length ? leg.stops : [
        { place: leg.origin, sequence: 1, boarded: true },
        { place: leg.destination, sequence: 2, boarded: true },
      ]) railStations.add(stop.place.id);
      if (leg.operator.trim()) railOperators.add(leg.operator.trim().toLocaleLowerCase());
    }
  }

  const railLegs = legs.filter((leg) => leg.mode === "rail");

  const railCountries = new Set<string>();
  const airCountries = new Set<string>();
  const visitedCountries = new Set<string>();
  for (const leg of [...legs].sort((first, second) => first.travelDate.localeCompare(second.travelDate))) {
    if (leg.mode === "air") {
      for (const place of [leg.origin, leg.destination]) {
        if (!/^[A-Z]{2}$/.test(place.country)) continue;
        airCountries.add(place.country);
        visitedCountries.add(place.country);
      }
      continue;
    }

    for (const stop of leg.stops.length ? leg.stops : [
      { place: leg.origin, boarded: true },
      { place: leg.destination, boarded: true },
    ]) {
      if (!stop.boarded || !/^[A-Z]{2}$/.test(stop.place.country)) continue;
      visitedCountries.add(stop.place.country);
      railCountries.add(stop.place.country);
    }
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
    railDistanceKm: railLegs.reduce((sum, leg) => sum + (leg.railDistanceKm ?? leg.distanceKm), 0),
    railDurationMinutes: railLegs.reduce((sum, leg) => sum + railLegDurationMinutes(leg), 0),
    railStations: railStations.size,
    railOperators: railOperators.size,
    railCountries: Array.from(railCountries),
    airCountries: Array.from(airCountries),
    operators: operators.size,
    airDistanceKm: legs.reduce((sum, leg) => leg.mode === "air" ? sum + leg.distanceKm : sum, 0),
    airDurationMinutes: legs.reduce(
      (sum, leg) => leg.mode === "air" ? sum + estimatedFlightMinutes(leg.distanceKm) : sum,
      0,
    ),
    visitedCountries: Array.from(visitedCountries),
    firstTripDate: dates[0] ?? null,
    lastTripDate: dates.at(-1) ?? null,
    busiestMonth: busiestMonth
      ? { month: busiestMonth[0], journeys: busiestMonth[1] }
      : null,
  };
}

export function railLegDurationMinutes(leg: JourneyLeg) {
  const firstStop = leg.stops[0];
  const lastStop = leg.stops.at(-1);
  const start = parseServiceTime(firstStop?.departure ?? firstStop?.arrival);
  const end = parseServiceTime(lastStop?.arrival ?? lastStop?.departure);
  if (start === null || end === null) return 0;
  return end >= start ? end - start : end + 24 * 60 - start;
}

function parseServiceTime(value?: string) {
  const match = value?.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return Number.isFinite(hours) && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null;
}
