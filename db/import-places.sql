begin;

create temp table places_raw (
  kind text,
  source text,
  source_id text,
  name text,
  country text,
  uic text,
  iata text,
  icao text,
  lat double precision,
  lon double precision
);

\copy places_raw from 'data/places.csv' with (format csv, header true);

insert into places (
  id, kind, source, source_id, name, city, country,
  uic, iata, icao, geom
)
select
  source || '-' || source_id,
  kind,
  source,
  source_id,
  name,
  name,
  country,
  nullif(uic, ''),
  nullif(iata, ''),
  nullif(icao, ''),
  ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
from places_raw
on conflict (source, source_id) do update set
  name = excluded.name,
  country = excluded.country,
  uic = excluded.uic,
  iata = excluded.iata,
  icao = excluded.icao,
  geom = excluded.geom;

commit;
