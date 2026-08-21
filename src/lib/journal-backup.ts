import type { Coordinate, JourneyLeg, LegStop, Place } from "@/lib/domain";

export const JOURNAL_STORAGE_KEY = "rail-log:journeys:v1";
export const JOURNAL_BACKUP_VERSION = 1;

export type JournalBackup = {
  version: typeof JOURNAL_BACKUP_VERSION;
  exportedAt: string;
  journeys: JourneyLeg[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
  );
}

function isPlace(value: unknown): value is Place {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    (value.kind === "station" || value.kind === "airport") &&
    typeof value.name === "string" &&
    typeof value.city === "string" &&
    typeof value.country === "string" &&
    typeof value.code === "string" &&
    isCoordinate(value.coordinates)
  );
}

function isStop(value: unknown): value is LegStop {
  if (!isRecord(value)) return false;

  return (
    isPlace(value.place) &&
    typeof value.sequence === "number" &&
    Number.isInteger(value.sequence) &&
    typeof value.boarded === "boolean" &&
    (value.arrival === undefined || typeof value.arrival === "string") &&
    (value.departure === undefined || typeof value.departure === "string")
  );
}

export function isJourneyLeg(value: unknown): value is JourneyLeg {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    (value.mode === "rail" || value.mode === "air") &&
    typeof value.number === "string" &&
    typeof value.travelDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.travelDate) &&
    typeof value.operator === "string" &&
    isPlace(value.origin) &&
    isPlace(value.destination) &&
    typeof value.distanceKm === "number" &&
    Number.isFinite(value.distanceKm) &&
    value.distanceKm >= 0 &&
    Array.isArray(value.geometry) &&
    value.geometry.every(isCoordinate) &&
    (value.source === "lookup" || value.source === "manual") &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.stops) &&
    value.stops.every(isStop)
  );
}

export function createJournalBackup(journeys: JourneyLeg[]): JournalBackup {
  return {
    version: JOURNAL_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    journeys,
  };
}

export function parseJournalBackup(contents: string): JournalBackup {
  const value = JSON.parse(contents) as unknown;

  if (
    !isRecord(value) ||
    value.version !== JOURNAL_BACKUP_VERSION ||
    typeof value.exportedAt !== "string" ||
    !Array.isArray(value.journeys) ||
    !value.journeys.every(isJourneyLeg)
  ) {
    throw new Error("This is not a valid Rail Log version 1 backup.");
  }

  return value as JournalBackup;
}

export function mergeJourneys(current: JourneyLeg[], incoming: JourneyLeg[]) {
  const merged = new Map(incoming.map((journey) => [journey.id, journey]));
  for (const journey of current) merged.set(journey.id, journey);
  return Array.from(merged.values());
}
