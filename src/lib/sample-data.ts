import type {
  Coordinate,
  JourneyLeg,
  LegStop,
  Place,
  TripCandidate,
} from "@/lib/domain";

const places = {
  hamburg: place("hamburg", "Hamburg Hbf", "Hamburg", "DE", "8002549", [10.0067, 53.5528]),
  hannover: place("hannover", "Hannover Hbf", "Hannover", "DE", "8000152", [9.7411, 52.377]),
  kassel: place("kassel", "Kassel-Wilhelmshöhe", "Kassel", "DE", "8003200", [9.4473, 51.3121]),
  frankfurt: place("frankfurt", "Frankfurt (Main) Hbf", "Frankfurt", "DE", "8000105", [8.6638, 50.1071]),
  mannheim: place("mannheim", "Mannheim Hbf", "Mannheim", "DE", "8000244", [8.4699, 49.4792]),
  basel: place("basel", "Basel SBB", "Basel", "CH", "8500010", [7.5896, 47.5476]),
  paris: place("paris", "Paris Gare de l’Est", "Paris", "FR", "8700011", [2.359, 48.8768]),
  strasbourg: place("strasbourg", "Strasbourg", "Strasbourg", "FR", "87212027", [7.7342, 48.585]),
  karlsruhe: place("karlsruhe", "Karlsruhe Hbf", "Karlsruhe", "DE", "8000191", [8.4022, 48.9935]),
  vienna: place("vienna", "Wien Hbf", "Vienna", "AT", "8103000", [16.3754, 48.185]),
  salzburg: place("salzburg", "Salzburg Hbf", "Salzburg", "AT", "8100002", [13.0457, 47.8127]),
  munich: place("munich", "München Hbf", "Munich", "DE", "8000261", [11.5583, 48.1402]),
  zurich: place("zurich", "Zürich HB", "Zürich", "CH", "8503000", [8.5402, 47.3782]),
  lugano: place("lugano", "Lugano", "Lugano", "CH", "8505300", [8.9476, 46.005]),
  milan: place("milan", "Milano Centrale", "Milan", "IT", "8300046", [9.2043, 45.4863]),
  bologna: place("bologna", "Bologna Centrale", "Bologna", "IT", "8300017", [11.343, 44.505]),
  florence: place("florence", "Firenze S. M. Novella", "Florence", "IT", "8300068", [11.2489, 43.7764]),
  rome: place("rome", "Roma Termini", "Rome", "IT", "8300084", [12.5021, 41.901]),
  berlin: place("berlin", "Berlin Hbf", "Berlin", "DE", "8011160", [13.3695, 52.5251]),
  dresden: place("dresden", "Dresden Hbf", "Dresden", "DE", "8010085", [13.732, 51.0404]),
  prague: place("prague", "Praha hlavní nádraží", "Prague", "CZ", "5457076", [14.4359, 50.0831]),
  brussels: place("brussels", "Bruxelles-Midi", "Brussels", "BE", "8814001", [4.3357, 50.8357]),
  amsterdam: place("amsterdam", "Amsterdam Centraal", "Amsterdam", "NL", "8400058", [4.9003, 52.3791]),
  schiphol: place("schiphol", "Schiphol Airport", "Amsterdam", "NL", "AMS", [4.7639, 52.3091], "airport"),
  berlinAirport: place("berlin-airport", "Berlin Brandenburg", "Berlin", "DE", "BER", [13.5033, 52.3667], "airport"),
} as const;

function place(
  id: string,
  name: string,
  city: string,
  country: string,
  code: string,
  coordinates: Coordinate,
  kind: Place["kind"] = "station",
): Place {
  return { id, name, city, country, code, coordinates, kind };
}

function stops(items: Array<[Place, string?, string?]>): LegStop[] {
  return items.map(([stopPlace, arrival, departure], index) => ({
    place: stopPlace,
    sequence: index + 1,
    arrival,
    departure,
    boarded: index === 0 || index === items.length - 1,
  }));
}

function geometryFor(journeyStops: LegStop[]): Coordinate[] {
  return journeyStops.map((stop) => stop.place.coordinates);
}

function railLeg(
  id: string,
  number: string,
  travelDate: string,
  operator: string,
  distanceKm: number,
  journeyStops: LegStop[],
): JourneyLeg {
  return {
    id,
    mode: "rail",
    number,
    travelDate,
    operator,
    origin: journeyStops[0].place,
    destination: journeyStops.at(-1)!.place,
    distanceKm,
    geometry: geometryFor(journeyStops),
    source: "lookup",
    createdAt: `${travelDate}T18:00:00.000Z`,
    stops: journeyStops,
  };
}

export const sampleLegs: JourneyLeg[] = [
  railLeg(
    "leg-ice-573",
    "ICE 573",
    "2026-06-07",
    "DB Fernverkehr",
    821,
    stops([
      [places.hamburg, undefined, "08:24"],
      [places.hannover, "09:38", "09:41"],
      [places.kassel, "10:35", "10:38"],
      [places.frankfurt, "12:00", "12:06"],
      [places.mannheim, "12:43", "12:46"],
      [places.basel, "15:34"],
    ]),
  ),
  railLeg(
    "leg-tgv-9576",
    "TGV 9576",
    "2026-06-14",
    "SNCF Voyageurs",
    530,
    stops([
      [places.paris, undefined, "13:52"],
      [places.strasbourg, "15:39", "15:47"],
      [places.karlsruhe, "16:31"],
    ]),
  ),
  railLeg(
    "leg-rjx-62",
    "RJX 62",
    "2026-06-23",
    "ÖBB",
    455,
    stops([
      [places.vienna, undefined, "09:28"],
      [places.salzburg, "11:53", "11:56"],
      [places.munich, "13:32"],
    ]),
  ),
  railLeg(
    "leg-ec-307",
    "EC 307",
    "2026-07-02",
    "SBB / Trenitalia",
    280,
    stops([
      [places.zurich, undefined, "10:33"],
      [places.lugano, "12:50", "12:54"],
      [places.milan, "14:17"],
    ]),
  ),
  railLeg(
    "leg-fr-9527",
    "FR 9527",
    "2026-07-11",
    "Trenitalia",
    568,
    stops([
      [places.milan, undefined, "08:10"],
      [places.bologna, "09:14", "09:17"],
      [places.florence, "09:54", "09:57"],
      [places.rome, "11:20"],
    ]),
  ),
  {
    id: "leg-kl-1776",
    mode: "air",
    number: "KL 1776",
    travelDate: "2026-07-20",
    operator: "KLM",
    origin: places.berlinAirport,
    destination: places.schiphol,
    distanceKm: 594,
    geometry: [places.berlinAirport.coordinates, places.schiphol.coordinates],
    source: "manual",
    createdAt: "2026-07-20T18:00:00.000Z",
    stops: stops([
      [places.berlinAirport, undefined, "17:30"],
      [places.schiphol, "18:55"],
    ]),
  },
  railLeg(
    "leg-ic-146",
    "IC 146",
    "2026-08-03",
    "NS International",
    211,
    stops([
      [places.amsterdam, undefined, "09:08"],
      [places.brussels, "11:17"],
    ]),
  ),
  railLeg(
    "leg-ec-175",
    "EC 175",
    "2026-08-09",
    "České dráhy",
    350,
    stops([
      [places.berlin, undefined, "07:16"],
      [places.dresden, "09:07", "09:10"],
      [places.prague, "11:24"],
    ]),
  ),
];

const ice573Stops = stops([
  [places.hamburg, undefined, "08:24"],
  [places.hannover, "09:38", "09:41"],
  [places.kassel, "10:35", "10:38"],
  [places.frankfurt, "12:00", "12:06"],
  [places.mannheim, "12:43", "12:46"],
  [places.basel, "15:34"],
]);

export const sampleTripIndex: TripCandidate[] = [
  {
    tripIndexId: "de-fv:ice-573:2026-07-14",
    mode: "rail",
    number: "ICE 573",
    travelDate: "2026-07-14",
    operator: "DB Fernverkehr",
    origin: places.hamburg,
    destination: places.basel,
    distanceKm: 821,
    geometry: geometryFor(ice573Stops),
    stops: ice573Stops,
  },
];

export const demoPlaces = Object.values(places);
