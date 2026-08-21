# Swiss GTFS archive

The local archive contains `GTFS_FP2026_20260819.zip`, the official nationwide
GTFS Static snapshot published by the Swiss public-transport data platform. The
224.2 MB binary is intentionally ignored by Git; this manifest and its checksum
are versioned.

- Publisher: Business office SKI on behalf of the Swiss Federal Office of
  Transport
- Dataset: <https://data.opentransportdata.swiss/en/dataset/timetable-2026-gtfs2020>
- Snapshot: `GTFS_FP2026_20260819.zip`
- Retrieved: 2026-08-21
- Feed version: `20260819`
- Feed/calendar coverage: 2025-12-14 through 2026-12-12
- SHA-256: `840c199324f148c60b4aed6b330c42ab8c653dc83b8aae911fd77131be4d78ab`
- Terms: commercial and non-commercial reuse allowed; source reference required

Restore the exact archived file from the official resource endpoint:

```sh
curl -fL \
  'https://data.opentransportdata.swiss/dataset/3d2c18f9-9ef1-463f-a249-5c67604efd74/resource/22498b28-9500-4282-8d75-0ccc6ed1d851/download/gtfs_fp2026_20260819.zip' \
  -o data/gtfs/archive/GTFS_FP2026_20260819.zip
cd data/gtfs/archive
shasum -a 256 -c GTFS_FP2026_20260819.zip.sha256
```

The snapshot covers the complete May–August 2026 journal window. It includes
all Swiss public transport, not only rail, so a future trip-index transform must
filter GTFS route types before matching train numbers. Keep this batch archive
outside the Next.js request path.
