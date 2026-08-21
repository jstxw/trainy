export type TravelMode = "rail" | "air";
export type PersistenceMode = "client" | "database";

export type Coordinate = [longitude: number, latitude: number];

export type Place = {
  id: string;
  kind: "station" | "airport";
  name: string;
  city: string;
  country: string;
  code: string;
  coordinates: Coordinate;
};

export type LegStop = {
  place: Place;
  sequence: number;
  arrival?: string;
  departure?: string;
  boarded: boolean;
};

export type JourneyLeg = {
  id: string;
  mode: TravelMode;
  number: string;
  travelDate: string;
  operator: string;
  origin: Place;
  destination: Place;
  distanceKm: number;
  geometry: Coordinate[];
  source: "lookup" | "manual";
  createdAt: string;
  stops: LegStop[];
};

export type TripCandidate = Omit<JourneyLeg, "id" | "createdAt" | "source"> & {
  tripIndexId: string;
};

export type TravelStats = {
  journeys: number;
  distanceKm: number;
  countries: number;
  places: number;
  railJourneys: number;
  airJourneys: number;
  firstTripDate?: string | null;
  lastTripDate?: string | null;
  busiestMonth?: {
    month: string;
    journeys: number;
  } | null;
};

export type MapFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "LineString";
      coordinates: Coordinate[];
    };
    properties: {
      id: string;
      mode: TravelMode;
      number: string;
      operator: string;
      travelDate: string;
      origin: string;
      destination: string;
      distanceKm: number;
    };
  }>;
};
