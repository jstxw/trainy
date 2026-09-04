import { test } from "node:test";
import assert from "node:assert/strict";
import { readSupabaseEnv } from "../src/lib/supabase-env.ts";

test("returns null when either public variable is missing", () => {
  assert.equal(readSupabaseEnv({}), null);
  assert.equal(readSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" }), null);
  assert.equal(readSupabaseEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_abc" }), null);
  assert.equal(readSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "  ", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" }), null);
});

test("returns the pair when both are present", () => {
  assert.deepEqual(
    readSupabaseEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_abc",
    }),
    { url: "https://x.supabase.co", anonKey: "sb_publishable_abc" },
  );
});
