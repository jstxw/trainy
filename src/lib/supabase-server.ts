import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { readSupabaseEnv } from "@/lib/supabase-env";

/**
 * A Supabase client bound to the current request's auth cookies. Every query
 * runs as the signed-in user (or as `anon` for guests), so row-level security
 * decides what is visible. Returns null when Supabase is not configured.
 */
export async function createServerSupabase(): Promise<SupabaseClient | null> {
  const env = readSupabaseEnv(process.env);
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The proxy refreshes the
          // session on the next request, so ignoring this is safe.
        }
      },
    },
  });
}

export async function getSessionUser(): Promise<User | null> {
  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
