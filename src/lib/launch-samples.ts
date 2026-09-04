import type { Coordinate, JourneyLeg, Place } from "@/lib/domain";

/**
 * Demo content for the launch page only. These legs are never written to any
 * journal; they exist so the hero shows the product drawing real routes.
 */

export const LAUNCH_STATS = {
  stations: 52_241,
  airports: 4_154,
  countries: 42,
} as const;

function station(id: string, name: string, city: string, country: string, code: string, coordinates: Coordinate): Place {
  return { id: `demo-station-${id}`, kind: "station", name, city, country, code, coordinates };
}

function airport(id: string, name: string, city: string, country: string, code: string, coordinates: Coordinate): Place {
  return { id: `demo-airport-${id}`, kind: "airport", name, city, country, code, coordinates };
}

const PARIS = station("paris-nord", "Paris Gare du Nord", "Paris", "FR", "8727100", [2.3553, 48.8809]);
const AMSTERDAM = station("amsterdam", "Amsterdam Centraal", "Amsterdam", "NL", "8400058", [4.9003, 52.3791]);
const ZURICH = station("zurich", "Zürich HB", "Zürich", "CH", "8503000", [8.5402, 47.3779]);
const MILANO = station("milano", "Milano Centrale", "Milan", "IT", "8300046", [9.2049, 45.4862]);
const BERLIN = station("berlin", "Berlin Hauptbahnhof", "Berlin", "DE", "8011160", [13.3694, 52.5251]);
const PRAHA = station("praha", "Praha hlavní nádraží", "Prague", "CZ", "5457076", [14.4356, 50.083]);
const WIEN = station("wien", "Wien Hauptbahnhof", "Vienna", "AT", "8103000", [16.3758, 48.185]);
const BUDAPEST = station("budapest", "Budapest-Keleti", "Budapest", "HU", "5510017", [19.0843, 47.5]);
const MADRID = station("madrid", "Madrid Puerta de Atocha", "Madrid", "ES", "7160000", [-3.6906, 40.4066]);
const BARCELONA = station("barcelona", "Barcelona Sants", "Barcelona", "ES", "7171801", [2.1404, 41.3792]);
const KOBENHAVN = station("kobenhavn", "København H", "Copenhagen", "DK", "8600626", [12.5645, 55.6728]);
const STOCKHOLM = station("stockholm", "Stockholm Central", "Stockholm", "SE", "7403751", [18.0586, 59.33]);
const LISBOA = airport("lis", "Lisbon Humberto Delgado Airport", "Lisbon", "PT", "LIS", [-9.1359, 38.7813]);
const ROMA = airport("fco", "Rome Fiumicino Airport", "Rome", "IT", "FCO", [12.2389, 41.8003]);
const DUBLIN = airport("dub", "Dublin Airport", "Dublin", "IE", "DUB", [-6.2701, 53.4213]);
const ATHENS = airport("ath", "Athens International Airport", "Athens", "GR", "ATH", [23.9445, 37.9364]);

function leg(
  id: string,
  mode: JourneyLeg["mode"],
  number: string,
  operator: string,
  travelDate: string,
  origin: Place,
  destination: Place,
  distanceKm: number,
  via: Coordinate[] = [],
): JourneyLeg {
  return {
    id: `demo-${id}`,
    mode,
    number,
    travelDate,
    operator,
    origin,
    destination,
    distanceKm,
    railDistanceKm: mode === "rail" ? Math.round(distanceKm * 1.2) : undefined,
    geometry: [origin.coordinates, ...via, destination.coordinates],
    source: "manual",
    createdAt: `${travelDate}T12:00:00.000Z`,
    stops: [
      { place: origin, sequence: 1, boarded: true },
      { place: destination, sequence: 2, boarded: true },
    ],
  };
}

export const LAUNCH_SAMPLE_LEGS: JourneyLeg[] = [
  leg("eurostar", "rail", "ES 9317", "Eurostar", "2026-05-03", PARIS, AMSTERDAM, 430, [[3.0707, 50.6366], [4.3571, 50.8355]]),
  leg("gotthard", "rail", "EC 313", "SBB", "2026-05-16", ZURICH, MILANO, 217, [[8.6339, 46.8863], [9.0295, 46.1953]]),
  leg("elbe", "rail", "EC 173", "České dráhy", "2026-06-02", BERLIN, PRAHA, 280, [[13.7373, 51.0405]]),
  leg("railjet", "rail", "RJX 63", "ÖBB", "2026-06-20", WIEN, BUDAPEST, 214),
  leg("ave", "rail", "AVE 3103", "Renfe", "2026-07-08", MADRID, BARCELONA, 505, [[-0.8891, 41.6488]]),
  leg("oresund", "rail", "X2 530", "SJ", "2026-07-27", KOBENHAVN, STOCKHOLM, 522, [[13.0038, 55.6091], [15.5869, 56.1612]]),
  leg("tap", "air", "TP 836", "TAP Air Portugal", "2026-08-11", LISBOA, ROMA, 1860),
  leg("aegean", "air", "A3 601", "Aegean Airlines", "2026-08-29", DUBLIN, ATHENS, 2860),
];
