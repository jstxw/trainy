# Deployment

## Public portfolio deployment

The safe default is a Vercel deployment without Supabase environment variables.
Import the Git repository, keep the standard Next.js build command, and deploy.
Every visitor then receives an empty journal whose data stays in their own
browser. Export/import remains available for backup.

The station and airport catalogs are included in the place-search function by
`outputFileTracingIncludes` in `next.config.ts`. After deployment, verify:

```text
GET /api/legs                         -> storage: "client"
GET /api/places/search?kind=station&q=Berlin
GET /api/places/search?kind=airport&q=FRA
```

Check the map at desktop and mobile widths with WebGL enabled.

## Private durable deployment

For a single private journal backed by Supabase:

1. Create the Supabase project and run `db/migrations/001_initial.sql`.
2. Load `data/places.csv` with `db/import-places.sql` through `psql`.
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as encrypted server-only
   environment variables in the host.
4. Protect the entire deployment with an authentication layer before exposing
   it. The current application routes deliberately use the service role and do
   not authenticate individual users.
5. Deploy, open the app in the browser that holds the local journal, and verify
   the one-time migration. Keep the local copy and export a JSON backup.

`src/app/page.tsx` calls Next.js `connection()` before reading the repository,
so personal rows and runtime environment variables are not captured during the
build.

## Not performed automatically

This repository does not contain Vercel or Supabase account credentials, so
project creation, environment configuration, and the external deployment must
be completed by the account owner. The local production build is the deployment
gate:

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
```
