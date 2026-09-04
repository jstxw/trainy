# Multi-tenant Auth and Launch Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every signed-in user an isolated Supabase journal, keep guest mode, and add a one-viewport launch page at `/`.

**Architecture:** A per-request cookie-backed Supabase client (anon key, `@supabase/ssr`) replaces the service-role admin client on all request paths. Row-level security plus user-scoped RPCs enforce isolation in Postgres. The dashboard moves to `/app`; `/` becomes a static launch page rendering the real map with fixed sample legs; `/login` handles magic link and Google.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`, server actions), React 19, `@supabase/ssr` 0.12, Supabase Auth, PostGIS, node test runner.

**Spec:** `docs/superpowers/specs/2026-09-04-multi-tenant-auth-launch-design.md`

## Global Constraints

- Next.js 16: middleware is `src/proxy.ts`, export named `proxy`. Read `node_modules/next/dist/docs` before touching routing.
- Tests run with `node --experimental-strip-types --test tests/*.test.mjs`; tests import `.ts` files directly.
- Env names: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` must not be read by app code after this plan.
- Guest mode (localStorage) must keep working with no env vars set.
- Launch page must not scroll on any breakpoint (`body` already has `overflow: hidden`; keep the page inside `100dvh`).
- Commit after each task with the session trailer.

---

### Task 1: Migration 002, multi-tenant schema

**Files:**
- Create: `db/migrations/002_multi_tenant.sql`
- Modify: `docs/deployment.md` (private deployment section)

**Interfaces:**
- Produces RPCs callable by role `authenticated`: `get_journeys(requested_mode text)`, `save_journey(journey jsonb)`, `import_journeys(journeys jsonb, replace_existing boolean, only_if_empty boolean)`, `delete_journey(journey_id text) returns boolean`.

- [ ] **Step 1: Write the migration** (full SQL in the executor's implementation; key clauses)

```sql
begin;
alter table legs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table legs alter column user_id set not null;
create index if not exists legs_user_travel_date_idx on legs (user_id, travel_date desc);

drop policy if exists legs_owner_select on legs;
create policy legs_owner_select on legs for select to authenticated using (user_id = auth.uid());
-- insert/update/delete policies likewise with using/with check (user_id = auth.uid())
-- leg_stops policies: exists (select 1 from legs where legs.id = leg_stops.leg_id and legs.user_id = auth.uid())
create policy places_read on places for select to authenticated using (true);

-- save_journey: security invoker; raise if auth.uid() is null; insert user_id = auth.uid();
-- on conflict (id) do update ... where legs.user_id = auth.uid()
-- get_journeys: add "and leg.user_id = auth.uid()"
-- import_journeys: emptiness check and delete scoped to user_id = auth.uid()
-- delete_journey(journey_id text): delete from legs where id = journey_id and user_id = auth.uid(); return found
-- rail_log_upsert_place: security definer, grant execute to authenticated
-- grants: execute on the four RPCs to authenticated, service_role; revoke from public, anon
commit;
```

- [ ] **Step 2: Syntax check** with `psql` if `DATABASE_URL` is set; otherwise review by reading the file top to bottom once.
- [ ] **Step 3: Update `docs/deployment.md`** to describe the multi-user deployment: run both migrations, set the two public env vars, configure providers, remove the service-role key.
- [ ] **Step 4: Commit** `feat(db): multi-tenant legs with RLS and user-scoped RPCs`

### Task 2: Server and browser Supabase clients

**Files:**
- Create: `src/lib/supabase-server.ts`, `src/lib/supabase-browser.ts`, `src/lib/supabase-env.ts`
- Delete: `src/lib/supabase-admin.ts`
- Test: `tests/supabase-env.test.mjs`

**Interfaces:**
- `supabase-env.ts` (no `server-only`, pure): `readSupabaseEnv(env: Record<string, string | undefined>): { url: string; anonKey: string } | null`, `isSupabaseConfigured(): boolean`.
- `supabase-server.ts` (`server-only`): `createServerSupabase(): Promise<SupabaseClient | null>`, `getSessionUser(): Promise<User | null>`.
- `supabase-browser.ts`: `createBrowserSupabase(): SupabaseClient | null`.

- [ ] **Step 1: Failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSupabaseEnv } from "../src/lib/supabase-env.ts";

test("returns null when either public variable is missing", () => {
  assert.equal(readSupabaseEnv({}), null);
  assert.equal(readSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" }), null);
});

test("returns the pair when both are present", () => {
  assert.deepEqual(
    readSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_abc" }),
    { url: "https://x.supabase.co", anonKey: "sb_publishable_abc" },
  );
});
```

- [ ] **Step 2: Run** `npm test` and see it fail on a missing module.
- [ ] **Step 3: Implement** the three files. Server client uses `createServerClient(url, key, { cookies: { getAll: () => store.getAll(), setAll: (list) => { try { list.forEach(({name, value, options}) => store.set(name, value, options)) } catch {} } } })` with `store = await cookies()`.
- [ ] **Step 4: Run** `npm test`, expect pass. `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(auth): per-request Supabase clients and env resolver`

### Task 3: User-scoped repository and API routes

**Files:**
- Modify: `src/lib/journey-repository.ts`, `src/lib/travel-log.ts`, `src/app/api/legs/route.ts`, `src/app/api/legs/manual/route.ts`, `src/app/api/legs/migrate/route.ts`, `src/app/api/stats/route.ts`, `src/app/api/map/route.ts`
- Create: `src/lib/persistence-mode.ts`
- Test: `tests/persistence-mode.test.mjs`

**Interfaces:**
- `persistence-mode.ts` (pure): `resolvePersistenceMode(configured: boolean, hasUser: boolean): PersistenceMode`.
- `journey-repository.ts`: `getPersistenceMode(): Promise<PersistenceMode>`; other exports keep names, take no client param, return `[]`/`false`/`0` for guests. `deleteJourney` calls RPC `delete_journey`.

- [ ] **Step 1: Failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePersistenceMode } from "../src/lib/persistence-mode.ts";

test("database only when configured and signed in", () => {
  assert.equal(resolvePersistenceMode(true, true), "database");
  assert.equal(resolvePersistenceMode(true, false), "client");
  assert.equal(resolvePersistenceMode(false, true), "client");
  assert.equal(resolvePersistenceMode(false, false), "client");
});
```

- [ ] **Step 2: Run**, fail. **Step 3: Implement** and update every `getPersistenceMode()` call site to `await`. **Step 4: Run** tests and `tsc`. **Step 5: Commit** `feat(auth): scope journal persistence to the signed-in user`

### Task 4: Proxy, login, callback, sign-out, dashboard move

**Files:**
- Create: `src/proxy.ts`, `src/lib/launch-redirect.ts`, `src/app/app/page.tsx`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/login/login-form.tsx`, `src/app/auth/callback/route.ts`
- Modify: `src/app/page.tsx` (temporarily redirect to `/app`; replaced in Task 5), `src/components/travel-dashboard.tsx` (add `account` prop and chip), `src/app/globals.css` (login and chip styles)
- Test: `tests/launch-redirect.test.mjs`

**Interfaces:**
- `launch-redirect.ts`: `launchRedirectTarget(pathname: string, signedIn: boolean): string | null` returns `/app` only for `/` when signed in.
- `TravelDashboard` props gain `account: { email: string } | null`.
- Server actions: `sendMagicLink(prev: LoginState, formData: FormData): Promise<LoginState>` where `LoginState = { status: "idle" | "sent" | "error"; message?: string }`; `signOut(): Promise<void>`.

- [ ] **Step 1: Failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { launchRedirectTarget } from "../src/lib/launch-redirect.ts";

test("signed-in visitors at the root go to the app", () => {
  assert.equal(launchRedirectTarget("/", true), "/app");
  assert.equal(launchRedirectTarget("/", false), null);
  assert.equal(launchRedirectTarget("/app", true), null);
  assert.equal(launchRedirectTarget("/login", true), null);
});
```

- [ ] **Step 2: Run**, fail. **Step 3: Implement** proxy with matcher `['/((?!_next/static|_next/image|favicon.ico|maplibre|images|.*\\.(?:svg|png|jpg|jpeg|webp|ico|css|js|mjs)$).*)']`; move dashboard page; login page and actions; callback route using `exchangeCodeForSession`; account chip in passport header.
- [ ] **Step 4: Run** tests, `tsc`, `lint`. **Step 5: Commit** `feat(auth): login, callback, proxy session refresh, dashboard at /app`

### Task 5: Launch page

**Files:**
- Create: `src/lib/launch-samples.ts`, `src/components/launch-page.tsx`, `src/app/launch.css` (imported by `src/app/page.tsx`)
- Modify: `src/app/page.tsx`, `src/app/layout.tsx` (metadata title to "Trainy")
- Test: `tests/launch-samples.test.mjs`

**Interfaces:**
- `launch-samples.ts`: `LAUNCH_SAMPLE_LEGS: JourneyLeg[]` (eight legs), `LAUNCH_STATS: { stations: 52241; airports: 4154; countries: 42 }`.
- `LaunchPage` is a server component rendering `MapShell` inside a `pointer-events: none` wrapper with `sidebarOpen={false}`.

- [ ] **Step 1: Failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { LAUNCH_SAMPLE_LEGS } from "../src/lib/launch-samples.ts";
import { isJourneyLeg } from "../src/lib/journal-backup.ts";

test("sample legs are valid journeys with unique ids", () => {
  assert.equal(LAUNCH_SAMPLE_LEGS.length, 8);
  assert.ok(LAUNCH_SAMPLE_LEGS.every(isJourneyLeg));
  assert.equal(new Set(LAUNCH_SAMPLE_LEGS.map((leg) => leg.id)).size, 8);
});
```

- [ ] **Step 2: Run**, fail. **Step 3: Load `frontend-design:frontend-design`, then implement** the page per the spec layout. **Step 4: Run** tests, `tsc`, `lint`, `npm run build`. **Step 5: Commit** `feat(launch): one-screen launch page with live sample map`

### Task 6: Env docs and final gate

- [ ] Update `.env.example` with the two public variables and comments; remove the service-role line or mark it operator-only.
- [ ] Run `npm test && npm run lint && npx tsc --noEmit && npm run build`.
- [ ] Commit `docs: environment for multi-user deployment`.
