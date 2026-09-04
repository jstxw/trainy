export type SupabasePublicEnv = {
  url: string;
  anonKey: string;
};

/**
 * Reads the two public Supabase variables. Both are safe to expose to the
 * browser: row-level security, not key secrecy, protects user data.
 * A newer `sb_publishable_...` key works in the anon key slot.
 */
export function readSupabaseEnv(
  env: Record<string, string | undefined>,
): SupabasePublicEnv | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured() {
  return readSupabaseEnv(process.env) !== null;
}
