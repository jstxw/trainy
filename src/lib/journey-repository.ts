import "server-only";
import type { JourneyLeg, PersistenceMode, TravelMode } from "@/lib/domain";
import { isJourneyLeg } from "@/lib/journal-backup";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-admin";

export function getPersistenceMode(): PersistenceMode {
  return isSupabaseConfigured() ? "database" : "client";
}

export async function findJourneys(mode?: TravelMode): Promise<JourneyLeg[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc("get_journeys", {
    requested_mode: mode ?? null,
  });
  if (error) throw new Error(`Could not load the Supabase journal: ${error.message}`);
  if (!Array.isArray(data) || !data.every(isJourneyLeg)) {
    throw new Error("Supabase returned an invalid journal payload.");
  }

  return data;
}

export async function saveJourney(journey: JourneyLeg) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { error } = await supabase.rpc("save_journey", { journey });
  if (error) throw new Error(`Could not save the journey to Supabase: ${error.message}`);
  return true;
}

export async function importJourneys(
  journeys: JourneyLeg[],
  options: { replaceExisting?: boolean; onlyIfEmpty?: boolean } = {},
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const { data, error } = await supabase.rpc("import_journeys", {
    journeys,
    replace_existing: options.replaceExisting ?? false,
    only_if_empty: options.onlyIfEmpty ?? false,
  });
  if (error) throw new Error(`Could not import the journal to Supabase: ${error.message}`);
  return typeof data === "number" ? data : Number(data ?? 0);
}

export async function deleteJourney(id: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { error } = await supabase.from("legs").delete().eq("id", id);
  if (error) throw new Error(`Could not delete the journey from Supabase: ${error.message}`);
  return true;
}
