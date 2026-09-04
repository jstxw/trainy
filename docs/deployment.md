# Deployment

Trainy runs in two modes from the same build.

- **Guest mode.** No Supabase variables set. Every visitor gets an empty journal
  that lives in their own browser. Export/import remains available for backup.
- **Multi-user mode.** Supabase variables set. Visitors can still use the app as
  guests, and anyone who signs in gets a private journal in Postgres, isolated
  by row-level security. Their browser journal is offered for import on first
  sign-in.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Host, public | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Host, public | Anon key, or a newer `sb_publishable_...` key. Safe in the browser: RLS protects data, not the key. |
| `NEXT_PUBLIC_CARTO_API_KEY` | Host, public | Basemap tiles. |
| `DATABASE_URL` | Your machine only | Used by the psql commands below. Never set it on the host. |

The application no longer reads `SUPABASE_SERVICE_ROLE_KEY`. Remove it from any
hosting environment that still has it.

## Database setup

Run once per Supabase project, from a machine with `psql`:

```sh
psql "$DATABASE_URL" -f db/migrations/001_initial.sql
psql "$DATABASE_URL" -f db/migrations/002_multi_tenant.sql
psql "$DATABASE_URL" -f db/import-places.sql   # loads data/places.csv
```

`002_multi_tenant.sql` adds `legs.user_id`, enables RLS policies on `legs`,
`leg_stops`, and `places`, and rewrites the RPCs so they run as the calling
user. It fails on purpose if `legs` already holds rows without an owner.

## Supabase Auth configuration

In the Supabase dashboard:

1. **Authentication → Providers → Email.** Keep Email enabled. Magic links are
   the only email flow the app uses; passwords are never collected.
2. **Authentication → Providers → Google.** Enable it and paste the OAuth
   client ID and secret from a Google Cloud OAuth client of type "Web
   application". Add the Supabase callback URL shown in that panel to the
   Google client's authorised redirect URIs.
3. **Authentication → URL configuration.** Set the Site URL to your production
   origin and add these to the redirect allow list:
   - `http://localhost:3000/auth/callback`
   - `https://<your-domain>/auth/callback`

## Deploying

Import the repository into Vercel (or any Node host), keep the standard Next.js
build command, add the three public variables, and deploy. After deployment,
verify:

```text
GET  /                              -> launch page (signed-in visitors are sent to /app)
GET  /app                           -> dashboard, works signed out
GET  /login                         -> magic link form and Google button
GET  /api/legs                      -> storage: "client" when signed out
GET  /api/places/search?kind=station&q=Berlin
```

Sign in with a magic link, add a journey, then open the site in a private
window: the journey must not appear there. Sign in as a second user and confirm
the journals are separate.

The station and airport catalogs are included in the place-search function by
`outputFileTracingIncludes` in `next.config.ts`. Check the map at desktop and
mobile widths with WebGL enabled.

## Local development

Copy `.env.example` to `.env.local`. Without Supabase values the app runs in
guest mode. With them, sign-in works against your project as long as the
localhost callback is on the allow list.

The local gate before pushing:

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
```
