# Multi-tenant journals, Supabase Auth, and a one-screen launch page

Date: 2026-09-04
Status: approved in chat, implementation follows

## Goal

Turn Trainy from a single-owner journal into a hosted tool that many people can
sign up for. Each signed-in user owns an isolated journal in Supabase. Guests
keep the existing browser-only journal. A one-viewport launch page introduces
the product.

## Decisions taken

- Sign-in methods: Supabase Auth email magic link, plus Google OAuth.
- Guest mode stays. The dashboard works without an account using localStorage.
  Signing in switches the same UI to the user's database journal.
- Routes: `/` launch page, `/app` dashboard, `/login` sign-in, `/auth/callback`
  code exchange. Signed-in visitors at `/` are redirected to `/app`.
- The service-role key leaves the request path entirely. All user-facing reads
  and writes go through a per-request cookie-backed client using the anon key
  and are enforced by row-level security.

## Out of scope

Profiles table, public passport pages, password login, custom email templates,
account deletion UI. Each is a later, separate piece of work.

## Schema: `db/migrations/002_multi_tenant.sql`

Run after `001_initial.sql`. Idempotent where practical.

1. `alter table legs add column user_id uuid not null references auth.users(id)
   on delete cascade`. The table has never held production rows. If rows exist
   the migration fails; the operator must assign owners first.
2. `create index legs_user_travel_date_idx on legs (user_id, travel_date desc)`.
3. Policies on `legs`: select, insert, update, delete for role `authenticated`
   with `user_id = auth.uid()` as both `using` and `with check`.
4. Policies on `leg_stops`: same four operations, each gated by
   `exists (select 1 from legs where legs.id = leg_stops.leg_id and legs.user_id = auth.uid())`.
5. Policy on `places`: select for `authenticated`. No direct write policies;
   writes happen only through `rail_log_upsert_place`, which stays
   `security definer`.
6. RPC rewrite, all `security invoker` except the place upsert:
   - `save_journey(journey jsonb)`: raises if `auth.uid()` is null; stamps
     `user_id = auth.uid()` on insert; on conflict updates only when the
     existing row belongs to the caller (RLS enforces this; the function also
     checks explicitly so the error is clear).
   - `get_journeys(requested_mode text)`: adds `and leg.user_id = auth.uid()`.
   - `import_journeys(journeys, replace_existing, only_if_empty)`: the
     emptiness check and the delete are scoped to `user_id = auth.uid()`.
   - `delete_journey(journey_id text) returns boolean`: new. Deletes the
     caller's leg by id and returns whether a row was removed.
7. Grants: execute on the four user RPCs to `authenticated` and `service_role`;
   revoke from `public` and `anon`. `rail_log_upsert_place` stays callable only
   from within the other functions (grant to `authenticated` is required for
   the invoker chain, so grant it, but no table-level write policy exists on
   `places`, and the function validates its payload).

## Auth plumbing

- Dependency: `@supabase/ssr`.
- `src/lib/supabase-server.ts`: `createServerSupabase()` builds a client from
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` using
  `cookies()` from `next/headers`. `getSessionUser()` returns the user or null.
  `isSupabaseConfigured()` moves here and checks the public pair.
- `src/lib/supabase-browser.ts`: browser client for the Google OAuth button
  redirect only.
- `src/proxy.ts`: for every non-static request, create an SSR client bound to
  the request and response cookies, call `getUser()` to refresh tokens, and if
  the path is `/` and a user exists redirect to `/app`. Matcher excludes
  `_next/static`, `_next/image`, `favicon.ico`, and common asset extensions.
- `src/lib/journey-repository.ts`: `getPersistenceMode()` becomes async and
  returns `database` only when Supabase is configured and a user is present.
  `findJourneys`, `saveJourney`, `importJourneys`, `deleteJourney` use the
  per-request client and return the empty or false result when there is no
  user, preserving the guest path.
- Route handlers under `src/app/api/legs/**` await the new async persistence
  mode. Their response shapes are unchanged.
- `src/lib/supabase-admin.ts` is deleted. Nothing imports it afterwards.
- Auth server actions in `src/app/login/actions.ts`: `sendMagicLink(formData)`
  calls `signInWithOtp` with `emailRedirectTo` at `/auth/callback`;
  `signOut()` clears the session and redirects to `/`.
- `src/app/auth/callback/route.ts`: exchanges `code` for a session and
  redirects to `/app`, or to `/login?error=...` on failure.

## Pages

- `src/app/page.tsx`: launch page, server component, static shell.
- `src/app/app/page.tsx`: the current dashboard page moved here. Calls
  `connection()`, loads legs for the current user, passes the persistence mode
  and the user's email (or null) to the dashboard.
- `src/app/login/page.tsx`: magic-link form using `useActionState`, a Google
  button, a link back to `/`, and a "continue without an account" link to
  `/app`. Shows the sent state after submit.
- Dashboard: a small account chip in the passport header. Signed in shows the
  email and a sign-out button. Guest shows a "Sign in to sync" link to `/login`.
  Everything else in the dashboard is unchanged; first-sign-in import reuses
  the existing migrate effect.

## Launch page design

One viewport. `html, body { height: 100%; overflow: hidden }` scoped to the
launch route via a route-level class on `body`. Grid of `100dvh`. No scrolling
on any breakpoint.

Desktop layout: left column about one third, right column two thirds.

- Left: brand mark, wordmark, a one-line promise ("Every train and flight you
  take, drawn on one map."), two supporting lines, two actions. Primary
  "Sign in" goes to `/login`. Secondary "Open the map without an account" goes
  to `/app`. Below, three small stat tiles from the bundled catalogs: stations
  searchable, airports searchable, countries covered.
- Right: the existing `JourneyMap` component rendering eight fixed sample
  European legs, non-interactive (`interactive={false}` or pointer-events off),
  fitted once on mount. Sample legs live in `src/lib/launch-samples.ts` and are
  used only by the launch page. They are demo content, not seeded journal
  data.
- Mobile (`< 720px`): the map fills the viewport as background; the copy
  becomes a card pinned to the bottom third with the actions. Stat tiles hide.

Visual language: the existing light indigo/lavender boarding-pass theme,
Nunito Sans for copy, IBM Plex Mono for the stat values. The frontend-design
skill is loaded before writing the page markup and CSS.

## Environment and external setup

App variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (an `sb_publishable_...` key works here)
- `NEXT_PUBLIC_CARTO_API_KEY` (already present)

Operator-only:

- `DATABASE_URL` for running migrations and the places import through psql.
- `SUPABASE_SERVICE_ROLE_KEY` is no longer read by the app. Remove it from
  hosting environments.

Supabase dashboard:

- Authentication > Providers: enable Email with magic link; enable Google with
  the OAuth client id and secret from Google Cloud.
- Authentication > URL configuration: set the site URL and add
  `http://localhost:3000/auth/callback` and the production
  `https://<domain>/auth/callback` to the redirect allow list.

## Error handling

- Missing Supabase env: app runs in guest mode, `/login` shows a notice that
  sign-in is not configured on this deployment.
- Auth callback failure: redirect to `/login?error=link` with a friendly line.
- RPC errors surface as 500 responses with the existing message shape; the
  dashboard keeps the local mirror so no data is lost.
- Proxy failures to refresh a session never block the request; the page
  renders as guest.

## Testing

- `tests/persistence-mode.test.mjs`: resolver returns `database` only when
  configured and a user exists.
- `tests/launch-redirect.test.mjs`: pure helper deciding the `/` to `/app`
  redirect from path and user presence.
- `tests/launch-samples.test.mjs`: sample legs pass `isJourneyLeg`.
- SQL is reviewed, not executed here. Documented command:
  `psql "$DATABASE_URL" -f db/migrations/002_multi_tenant.sql`.
- Gate: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Deviations recorded during implementation

- No browser Supabase client. Google sign-in starts from a server action
  (`signInWithGoogle`) that calls `signInWithOAuth` and redirects to the
  provider URL, so the PKCE verifier lives in the cookie session like the
  magic link flow. `src/lib/supabase-browser.ts` was not kept.
- Launch layout is a full-bleed map with a floating boarding-pass ticket
  (`.ticket`) rather than two fixed columns. The ticket occupies the left
  third on desktop and pins to the bottom on phones. Same content, same
  one-viewport rule.
- Launch styles live in `globals.css` alongside everything else instead of a
  separate `launch.css`, matching the project's single-stylesheet convention.
- `/login` types its `searchParams` inline because Next's generated route types
  only knew `/` at the time of writing.
