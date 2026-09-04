import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JourneyLeg, PersistenceMode, TravelMode } from "@/lib/domain";
import { isJourneyLeg } from "@/lib/journal-backup";
import { resolvePersistenceMode } from "@/lib/persistence-mode";
import { isSupabaseConfigured } from "@/lib/supabase-env";
import { createServerSupabase } from "@/lib/supabase-server";

/**
 * Returns a client only when the request carries a signed-in user. Guests get
 * null and fall through to the browser journal, exactly as when Supabase is
 * not configured at all.
 */
async function userClient(): Promise<SupabaseClient | null> {
  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return supabase;
}

export async function getPersistenceMode(): Promise<PersistenceMode> {
  const configured = isSupabaseConfigured();
  if (!configured) return resolvePersistenceMode(false, false);
  return resolvePersistenceMode(true, (await userClient()) !== null);
}

export async function findJourneys(mode?: TravelMode): Promise<JourneyLeg[]> {
  const supabase = await userClient();
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
  const supabase = await userClient();
  if (!supabase) return false;

  const { error } = await supabase.rpc("save_journey", { journey });
  if (error) throw new Error(`Could not save the journey to Supabase: ${error.message}`);
  return true;
}

export async function importJourneys(
  journeys: JourneyLeg[],
  options: { replaceExisting?: boolean; onlyIfEmpty?: boolean } = {},
) {
  const supabase = await userClient();
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
  const supabase = await userClient();
  if (!supabase) return false;

  const { data, error } = await supabase.rpc("delete_journey", { journey_id: id });
  if (error) throw new Error(`Could not delete the journey from Supabase: ${error.message}`);
  return data === true;
}
