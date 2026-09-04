import type { PersistenceMode } from "@/lib/domain";

/**
 * Guests always use the browser journal. The database journal is only
 * available when Supabase is configured and the request carries a signed-in
 * user, so anonymous requests can never reach the RPC layer.
 */
export function resolvePersistenceMode(configured: boolean, hasUser: boolean): PersistenceMode {
  return configured && hasUser ? "database" : "client";
}
