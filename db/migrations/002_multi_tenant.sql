-- 002_multi_tenant.sql
--
-- Turns the single-owner journal into a multi-user one. Every leg belongs to a
-- Supabase Auth user, row-level security isolates journals, and the RPCs run as
-- the calling user instead of the service role.
--
-- Run after 001_initial.sql:
--   psql "$DATABASE_URL" -f db/migrations/002_multi_tenant.sql
--
-- The legs table has never held production rows. If it does on your database,
-- the NOT NULL step below fails on purpose: assign owners first.

begin;

-- ---------------------------------------------------------------------------
-- Ownership column
-- ---------------------------------------------------------------------------

alter table legs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table legs alter column user_id set not null;

create index if not exists legs_user_travel_date_idx
  on legs (user_id, travel_date desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table legs enable row level security;
alter table leg_stops enable row level security;
alter table places enable row level security;

drop policy if exists legs_owner_select on legs;
drop policy if exists legs_owner_insert on legs;
drop policy if exists legs_owner_update on legs;
drop policy if exists legs_owner_delete on legs;

create policy legs_owner_select on legs
  for select to authenticated
  using (user_id = auth.uid());

create policy legs_owner_insert on legs
  for insert to authenticated
  with check (user_id = auth.uid());

create policy legs_owner_update on legs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy legs_owner_delete on legs
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists leg_stops_owner_select on leg_stops;
drop policy if exists leg_stops_owner_insert on leg_stops;
drop policy if exists leg_stops_owner_update on leg_stops;
drop policy if exists leg_stops_owner_delete on leg_stops;

create policy leg_stops_owner_select on leg_stops
  for select to authenticated
  using (exists (
    select 1 from legs
    where legs.id = leg_stops.leg_id and legs.user_id = auth.uid()
  ));

create policy leg_stops_owner_insert on leg_stops
  for insert to authenticated
  with check (exists (
    select 1 from legs
    where legs.id = leg_stops.leg_id and legs.user_id = auth.uid()
  ));

create policy leg_stops_owner_update on leg_stops
  for update to authenticated
  using (exists (
    select 1 from legs
    where legs.id = leg_stops.leg_id and legs.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from legs
    where legs.id = leg_stops.leg_id and legs.user_id = auth.uid()
  ));

create policy leg_stops_owner_delete on leg_stops
  for delete to authenticated
  using (exists (
    select 1 from legs
    where legs.id = leg_stops.leg_id and legs.user_id = auth.uid()
  ));

-- Places are shared reference data. Anyone signed in may read them. Writes go
-- only through rail_log_upsert_place, which is security definer and validates
-- its payload, so no insert/update policy is granted to users.
drop policy if exists places_read on places;
create policy places_read on places
  for select to authenticated
  using (true);

grant select on places to authenticated;
grant select, insert, update, delete on legs to authenticated;
grant select, insert, update, delete on leg_stops to authenticated;

-- ---------------------------------------------------------------------------
-- Shared place upsert stays security definer (writes to the shared table).
-- Body unchanged from 001; redefined here so the security mode is explicit.
-- ---------------------------------------------------------------------------

create or replace function rail_log_upsert_place(place_payload jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  place_id text := place_payload->>'id';
  place_kind text := place_payload->>'kind';
  place_code text := coalesce(place_payload->>'code', '');
  place_source text;
  place_source_id text;
begin
  if place_id is null or place_kind not in ('station', 'airport') then
    raise exception 'Invalid place payload';
  end if;

  if place_payload->>'name' is null
     or place_payload->>'country' is null
     or jsonb_typeof(place_payload->'coordinates') <> 'array'
     or jsonb_array_length(place_payload->'coordinates') <> 2 then
    raise exception 'Invalid place payload';
  end if;

  place_source := case
    when place_id like 'trainline-%' then 'trainline'
    when place_id like 'ourairports-%' then 'ourairports'
    else case when place_kind = 'station' then 'trainline' else 'ourairports' end
  end;
  place_source_id := regexp_replace(place_id, '^[^-]+-', '');

  insert into places (
    id, kind, source, source_id, name, city, country,
    uic, iata, icao, geom
  ) values (
    place_id,
    place_kind,
    place_source,
    place_source_id,
    place_payload->>'name',
    coalesce(nullif(place_payload->>'city', ''), place_payload->>'name'),
    place_payload->>'country',
    case when place_kind = 'station' and place_code ~ '^[0-9]+$' then place_code end,
    case when place_kind = 'airport' and length(place_code) = 3 then place_code end,
    case when place_kind = 'airport' and length(place_code) = 4 then place_code end,
    ST_SetSRID(
      ST_MakePoint(
        (place_payload->'coordinates'->>0)::double precision,
        (place_payload->'coordinates'->>1)::double precision
      ),
      4326
    )::geography
  )
  on conflict (id) do update set
    name = excluded.name,
    city = excluded.city,
    country = excluded.country,
    uic = coalesce(excluded.uic, places.uic),
    iata = coalesce(excluded.iata, places.iata),
    icao = coalesce(excluded.icao, places.icao),
    geom = excluded.geom;

  return place_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_journey: runs as the caller, stamps ownership, RLS enforces isolation.
-- ---------------------------------------------------------------------------

create or replace function save_journey(journey jsonb)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  origin_id text;
  destination_id text;
  stop_payload jsonb;
  stop_place_id text;
  route_geometry geometry(LineString, 4326);
  direct_distance numeric(10, 1);
  existing_owner uuid;
begin
  if caller is null then
    raise exception 'Sign in to save journeys' using errcode = '42501';
  end if;

  if journey->>'id' is null or journey->>'mode' not in ('rail', 'air') then
    raise exception 'Invalid journey payload';
  end if;

  -- RLS hides other users' rows, so a visible row is always the caller's own.
  -- If the id exists but is not visible the insert fails on the primary key,
  -- which is the correct outcome: ids are never shared across users.
  select user_id into existing_owner from legs where id = journey->>'id';
  if existing_owner is not null and existing_owner <> caller then
    raise exception 'Journey belongs to another user' using errcode = '42501';
  end if;

  origin_id := rail_log_upsert_place(journey->'origin');
  destination_id := rail_log_upsert_place(journey->'destination');

  if jsonb_typeof(journey->'geometry') = 'array' and jsonb_array_length(journey->'geometry') >= 2 then
    select ST_SetSRID(
      ST_MakeLine(
        array_agg(
          ST_MakePoint(
            (coordinate->>0)::double precision,
            (coordinate->>1)::double precision
          ) order by position
        )
      ),
      4326
    )
    into route_geometry
    from jsonb_array_elements(journey->'geometry') with ordinality as points(coordinate, position);
  else
    select ST_SetSRID(ST_MakeLine(origin.geom::geometry, destination.geom::geometry), 4326)
    into route_geometry
    from places origin, places destination
    where origin.id = origin_id and destination.id = destination_id;
  end if;

  select round((ST_Distance(origin.geom, destination.geom) / 1000)::numeric, 1)
  into direct_distance
  from places origin, places destination
  where origin.id = origin_id and destination.id = destination_id;

  insert into legs (
    id, user_id, mode, number, travel_date, operator, origin_place_id,
    destination_place_id, distance_km, geom, source, created_at
  ) values (
    journey->>'id',
    caller,
    journey->>'mode',
    journey->>'number',
    (journey->>'travelDate')::date,
    nullif(journey->>'operator', ''),
    origin_id,
    destination_id,
    direct_distance,
    route_geometry::geography,
    journey->>'source',
    coalesce((journey->>'createdAt')::timestamptz, now())
  )
  on conflict (id) do update set
    mode = excluded.mode,
    number = excluded.number,
    travel_date = excluded.travel_date,
    operator = excluded.operator,
    origin_place_id = excluded.origin_place_id,
    destination_place_id = excluded.destination_place_id,
    distance_km = excluded.distance_km,
    geom = excluded.geom,
    source = excluded.source
  where legs.user_id = caller;

  delete from leg_stops where leg_id = journey->>'id';

  if jsonb_typeof(journey->'stops') = 'array' and jsonb_array_length(journey->'stops') > 0 then
    for stop_payload in select value from jsonb_array_elements(journey->'stops') loop
      stop_place_id := rail_log_upsert_place(stop_payload->'place');
      insert into leg_stops (
        leg_id, place_id, sequence, arrival, departure, boarded
      ) values (
        journey->>'id',
        stop_place_id,
        (stop_payload->>'sequence')::integer,
        nullif(stop_payload->>'arrival', '')::time,
        nullif(stop_payload->>'departure', '')::time,
        coalesce((stop_payload->>'boarded')::boolean, false)
      );
    end loop;
  else
    insert into leg_stops (leg_id, place_id, sequence, boarded) values
      (journey->>'id', origin_id, 1, true),
      (journey->>'id', destination_id, 2, true);
  end if;

  return journey->>'id';
end;
$$;

-- ---------------------------------------------------------------------------
-- import_journeys: emptiness check and replace are scoped to the caller.
-- ---------------------------------------------------------------------------

create or replace function import_journeys(
  journeys jsonb,
  replace_existing boolean default false,
  only_if_empty boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  journey_payload jsonb;
  imported integer := 0;
begin
  if caller is null then
    raise exception 'Sign in to import journeys' using errcode = '42501';
  end if;

  if jsonb_typeof(journeys) <> 'array' then
    raise exception 'Journeys must be a JSON array';
  end if;

  if only_if_empty and exists (select 1 from legs where user_id = caller limit 1) then
    return 0;
  end if;

  if replace_existing then
    delete from legs where user_id = caller;
  end if;

  for journey_payload in select value from jsonb_array_elements(journeys) loop
    perform save_journey(journey_payload);
    imported := imported + 1;
  end loop;

  return imported;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_journeys: only the caller's legs.
-- ---------------------------------------------------------------------------

create or replace function get_journeys(requested_mode text default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', leg.id,
        'mode', leg.mode,
        'number', leg.number,
        'travelDate', leg.travel_date,
        'operator', coalesce(leg.operator, 'Unknown operator'),
        'origin', rail_log_place_json(origin),
        'destination', rail_log_place_json(destination),
        'distanceKm', leg.distance_km,
        'geometry', (ST_AsGeoJSON(leg.geom::geometry)::jsonb)->'coordinates',
        'source', leg.source,
        'createdAt', leg.created_at,
        'stops', coalesce(
          (
            select jsonb_agg(
              jsonb_strip_nulls(
                jsonb_build_object(
                  'place', rail_log_place_json(stop_place),
                  'sequence', stop.sequence,
                  'arrival', stop.arrival,
                  'departure', stop.departure,
                  'boarded', stop.boarded
                )
              ) order by stop.sequence
            )
            from leg_stops stop
            join places stop_place on stop_place.id = stop.place_id
            where stop.leg_id = leg.id
          ),
          '[]'::jsonb
        )
      ) order by leg.travel_date desc, leg.created_at desc
    ),
    '[]'::jsonb
  )
  from legs leg
  join places origin on origin.id = leg.origin_place_id
  join places destination on destination.id = leg.destination_place_id
  where leg.user_id = auth.uid()
    and (requested_mode is null or leg.mode = requested_mode);
$$;

-- ---------------------------------------------------------------------------
-- delete_journey: new. Returns whether a row was removed.
-- ---------------------------------------------------------------------------

create or replace function delete_journey(journey_id text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  removed integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to delete journeys' using errcode = '42501';
  end if;

  delete from legs where id = journey_id and user_id = auth.uid();
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function rail_log_upsert_place(jsonb) from public, anon;
revoke execute on function save_journey(jsonb) from public, anon;
revoke execute on function import_journeys(jsonb, boolean, boolean) from public, anon;
revoke execute on function get_journeys(text) from public, anon;
revoke execute on function delete_journey(text) from public, anon;
revoke execute on function rail_log_place_json(places) from public, anon;

grant execute on function rail_log_upsert_place(jsonb) to authenticated, service_role;
grant execute on function save_journey(jsonb) to authenticated, service_role;
grant execute on function import_journeys(jsonb, boolean, boolean) to authenticated, service_role;
grant execute on function get_journeys(text) to authenticated, service_role;
grant execute on function delete_journey(text) to authenticated, service_role;
grant execute on function rail_log_place_json(places) to authenticated, service_role;

commit;
