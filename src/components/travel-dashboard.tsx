"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Check,
  CircleGauge,
  Cloud,
  Download,
  Globe2,
  HardDrive,
  MapPin,
  Plane,
  Plus,
  Route,
  TrainFront,
  Trash2,
  Upload,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { MapShell } from "@/components/map-shell";
import type {
  JourneyLeg,
  PersistenceMode,
  Place,
  TravelMode,
  TravelStats,
} from "@/lib/domain";
import {
  createJournalBackup,
  isJourneyLeg,
  JOURNAL_STORAGE_KEY,
  mergeJourneys,
  parseJournalBackup,
} from "@/lib/journal-backup";

type ModeFilter = "all" | TravelMode;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function statsFor(legs: JourneyLeg[]): TravelStats {
  const countries = new Set<string>();
  const places = new Set<string>();

  for (const leg of legs) {
    for (const stop of leg.stops) {
      countries.add(stop.place.country);
      places.add(stop.place.id);
    }
  }

  return {
    journeys: legs.length,
    distanceKm: legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
    countries: countries.size,
    places: places.size,
    railJourneys: legs.filter((leg) => leg.mode === "rail").length,
    airJourneys: legs.filter((leg) => leg.mode === "air").length,
  };
}

function StatCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="stat-card">
      <span className="stat-card__icon">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function PlaceCombobox({
  label,
  kind,
  value,
  onChange,
  excludeId,
}: {
  label: string;
  kind: Place["kind"];
  value: Place | null;
  onChange: (place: Place | null) => void;
  excludeId?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState(value?.name ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2 || (value && trimmedQuery === value.name)) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/places/search?kind=${kind}&q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as { places?: Place[] };
        setResults((data.places ?? []).filter((place) => place.id !== excludeId));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [excludeId, kind, query, value]);

  function selectPlace(place: Place) {
    setQuery(place.name);
    setResults([]);
    setOpen(false);
    onChange(place);
  }

  return (
    <label className="station-search">
      <span>{label}</span>
      <div className="station-search__control">
        <MapPin size={16} />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            onChange(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 140)}
          placeholder={kind === "station" ? "Search any European station" : "Search airport, city or IATA code"}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && query.trim().length >= 2}
          aria-controls={listId}
          aria-autocomplete="list"
          required
        />
        {value && <Check className="station-search__check" size={15} />}
      </div>

      {open && query.trim().length >= 2 && !value && (
        <div className="station-results" id={listId} role="listbox">
          {loading ? (
            <p>{kind === "station" ? "Searching 52,000+ stations…" : "Searching 4,000+ airports…"}</p>
          ) : results.length ? (
            results.map((place) => (
              <button
                type="button"
                role="option"
                aria-selected="false"
                key={place.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectPlace(place)}
              >
                <span>{kind === "station" ? <TrainFront size={15} /> : <Plane size={15} />}</span>
                <div>
                  <strong>{place.name}</strong>
                  <small>{place.city !== place.name ? `${place.city} · ` : ""}{place.country} · {place.code}</small>
                </div>
              </button>
            ))
          ) : (
            <p>{kind === "station" ? "No matching station. Try a nearby city or UIC code." : "No matching airport. Try its city, name, IATA or ICAO code."}</p>
          )}
        </div>
      )}
    </label>
  );
}

function AddJourney({
  onAdd,
  persistence,
}: {
  onAdd: (leg: JourneyLeg) => void;
  persistence: PersistenceMode;
}) {
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<TravelMode>("rail");
  const [operator, setOperator] = useState("");
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "added" | "error">("idle");

  function changeMode(nextMode: TravelMode) {
    setMode(nextMode);
    setOrigin(null);
    setDestination(null);
    setStatus("idle");
  }

  async function submitJourney(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");

    try {
      const response = await fetch("/api/legs/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          number,
          travelDate: date,
          operator,
          origin,
          destination,
        }),
      });
      const data = (await response.json()) as { leg?: JourneyLeg };
      if (!response.ok || !data.leg) throw new Error("Could not add journey");

      onAdd(data.leg);
      setNumber("");
      setOperator("");
      setOrigin(null);
      setDestination(null);
      setStatus("added");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="add-card" id="add-journey" aria-labelledby="add-journey-title">
      <div className="add-card__heading">
        <span className="section-kicker">New entry</span>
        <h2 id="add-journey-title">Add your journey</h2>
        <p>Choose the endpoints and it will appear on your map.</p>
      </div>

      <form className="journey-form journey-form--manual" onSubmit={submitJourney}>
        <div className="mode-choice" aria-label="Journey mode">
          <button
            className={mode === "rail" ? "is-active" : ""}
            type="button"
            onClick={() => changeMode("rail")}
          >
            <TrainFront size={16} /> Rail
          </button>
          <button
            className={mode === "air" ? "is-active" : ""}
            type="button"
            onClick={() => changeMode("air")}
          >
            <Plane size={16} /> Air
          </button>
        </div>

        <div className="form-row">
          <label>
            <span>Train or flight number</span>
            <input
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              placeholder={mode === "rail" ? "e.g. ICE 573" : "e.g. KL 1776"}
              autoComplete="off"
              required
            />
          </label>
          <label>
            <span>Travel date</span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </label>
        </div>

        <label>
          <span>Operator <small>optional</small></span>
          <input
            value={operator}
            onChange={(event) => setOperator(event.target.value)}
            placeholder={mode === "rail" ? "e.g. Deutsche Bahn" : "e.g. KLM"}
          />
        </label>

        <div className="form-row station-search-row">
          <PlaceCombobox
            label="From"
            kind={mode === "rail" ? "station" : "airport"}
            value={origin}
            onChange={setOrigin}
            excludeId={destination?.id}
          />
          <PlaceCombobox
            label="To"
            kind={mode === "rail" ? "station" : "airport"}
            value={destination}
            onChange={setDestination}
            excludeId={origin?.id}
          />
        </div>

        <button
          className="primary-button primary-button--wide"
          disabled={status === "loading" || !origin || !destination}
        >
          {status === "loading" ? "Adding…" : "Add to journal"}
          {status !== "loading" && <ArrowRight size={17} />}
        </button>
      </form>

      <div className="form-feedback" aria-live="polite">
        {status === "added" && (
          <p className="feedback-note feedback-note--success">
            <Check size={15} /> Saved to your journal and map.
          </p>
        )}
        {status === "error" && (
          <p className="feedback-note feedback-note--error">
            Choose two different places and try again.
          </p>
        )}
      </div>

      <p className="demo-note">
        {persistence === "database" ? <Cloud size={12} /> : <HardDrive size={12} />}
        {persistence === "database"
          ? "Stored in Supabase with a browser backup"
          : "Stored locally in this browser"}
      </p>
    </section>
  );
}

function JourneyList({
  legs,
  onRemove,
}: {
  legs: JourneyLeg[];
  onRemove: (id: string) => void;
}) {
  const journeys = [...legs].sort((a, b) => b.travelDate.localeCompare(a.travelDate));

  return (
    <section className="journal-card" id="journal" aria-labelledby="journal-title">
      <div className="card-heading-row">
        <div>
          <span className="section-kicker">Journal</span>
          <h2 id="journal-title">Your journeys</h2>
        </div>
        <span className="journey-total">{journeys.length}</span>
      </div>

      {journeys.length === 0 ? (
        <div className="journal-empty">
          <Route size={22} />
          <strong>No journeys yet</strong>
          <p>Your first entry will appear here.</p>
        </div>
      ) : (
        <div className="journey-list">
          {journeys.map((leg) => (
            <article className="journey-row" key={leg.id}>
              <span className={`journey-row__mode journey-row__mode--${leg.mode}`}>
                {leg.mode === "rail" ? <TrainFront size={17} /> : <Plane size={17} />}
              </span>
              <div className="journey-row__main">
                <div>
                  <strong>{leg.origin.city}</strong>
                  <span className="route-line" aria-hidden="true"><i /></span>
                  <strong>{leg.destination.city}</strong>
                </div>
                <p>{leg.number} · {leg.operator}</p>
              </div>
              <div className="journey-row__meta">
                <time dateTime={leg.travelDate}>{formatDate(leg.travelDate)}</time>
                <span>{leg.distanceKm.toLocaleString("en-GB")} km</span>
              </div>
              <button
                className="journey-row__delete"
                type="button"
                title="Delete journey"
                aria-label={`Delete ${leg.number} from ${leg.origin.city} to ${leg.destination.city}`}
                onClick={() => onRemove(leg.id)}
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function TravelDashboard({
  initialLegs,
  persistence,
}: {
  initialLegs: JourneyLeg[];
  persistence: PersistenceMode;
}) {
  const [legs, setLegs] = useState(initialLegs);
  const [mode, setMode] = useState<ModeFilter>("all");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [backupStatus, setBackupStatus] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(JOURNAL_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as unknown;
      if (!Array.isArray(parsed)) return;

      const validLegs = parsed.filter(isJourneyLeg);
      if (persistence === "client") {
        queueMicrotask(() => setLegs(validLegs));
        return;
      }
      if (initialLegs.length > 0 || validLegs.length === 0) return;

      void fetch("/api/legs/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journeys: validLegs, onlyIfEmpty: true }),
      })
        .then(async (response) => {
          const data = (await response.json()) as { legs?: JourneyLeg[]; migrated?: number };
          if (!response.ok || !data.legs?.every(isJourneyLeg)) {
            throw new Error("Could not migrate the browser journal.");
          }
          setLegs(data.legs);
          setBackupStatus(
            data.migrated
              ? `Migrated ${data.migrated} ${data.migrated === 1 ? "journey" : "journeys"} to Supabase.`
              : "Supabase already contains journeys; the browser backup was kept unchanged.",
          );
        })
        .catch(() => {
          setLegs(validLegs);
          setBackupStatus("Supabase migration failed; using the browser backup.");
        });
    } catch {
      // Ignore malformed or unavailable browser storage and start with an empty log.
    }
  }, [initialLegs.length, persistence]);

  const visibleLegs = useMemo(
    () => legs.filter((leg) => mode === "all" || leg.mode === mode),
    [legs, mode],
  );
  const stats = useMemo(() => statsFor(legs), [legs]);

  function saveLegs(nextLegs: JourneyLeg[]) {
    try {
      window.localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(nextLegs));
    } catch {
      // The in-memory journal still works if storage is unavailable.
    }
  }

  function addLeg(leg: JourneyLeg) {
    setLegs((current) => {
      const nextLegs = current.some((item) => item.id === leg.id) ? current : [...current, leg];
      saveLegs(nextLegs);
      return nextLegs;
    });
  }

  async function removeLeg(id: string) {
    const previousLegs = legs;
    const nextLegs = legs.filter((leg) => leg.id !== id);
    setLegs(nextLegs);
    saveLegs(nextLegs);

    if (persistence === "database") {
      try {
        const response = await fetch(`/api/legs?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("Delete failed");
      } catch {
        setLegs(previousLegs);
        saveLegs(previousLegs);
        setBackupStatus("Could not delete from Supabase; the journey was restored.");
      }
    }
  }

  function exportJournal() {
    const backup = createJournalBackup(legs);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rail-log-${backup.exportedAt.slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setBackupStatus(`Exported ${legs.length} ${legs.length === 1 ? "journey" : "journeys"}.`);
  }

  async function importJournal(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const backup = parseJournalBackup(await file.text());
      let nextLegs = importMode === "replace"
        ? backup.journeys
        : mergeJourneys(legs, backup.journeys);

      if (persistence === "database") {
        const response = await fetch("/api/legs/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            journeys: nextLegs,
            replaceExisting: importMode === "replace",
          }),
        });
        const data = (await response.json()) as { legs?: JourneyLeg[]; error?: string };
        if (!response.ok || !data.legs?.every(isJourneyLeg)) {
          throw new Error(data.error || "Could not import this backup to Supabase.");
        }
        nextLegs = data.legs;
      }

      saveLegs(nextLegs);
      setLegs(nextLegs);
      setBackupStatus(
        `${importMode === "replace" ? "Restored" : "Merged"} ${backup.journeys.length} ${backup.journeys.length === 1 ? "journey" : "journeys"}.`,
      );
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : "Could not import this backup.");
    }
  }

  function jumpToAddJourney() {
    document.getElementById("add-journey")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#overview" aria-label="Rail Log home">
          <BrandMark />
          <span>rail log</span>
        </a>
        <nav className="topnav" aria-label="Primary navigation">
          <a href="#overview" className="is-active">Overview</a>
          <a href="#map">Map</a>
          <a href="#journal">Journal</a>
        </nav>
        <div className="topbar__actions">
          <span className="demo-pill"><i /> {persistence === "database" ? "Supabase journal" : "Local journal"}</span>
          <button type="button" className="primary-button primary-button--compact" onClick={jumpToAddJourney}>
            <Plus size={16} /> Add journey
          </button>
        </div>
      </header>

      <main id="overview">
        <section className="hero-section">
          <div>
            <span className="eyebrow"><span /> Personal travel journal</span>
            <h1>Every journey,<br /><em>drawn in lines.</em></h1>
          </div>
          <p>
            Keep one private record of the trains and flights that carried you
            across Europe — one line at a time.
          </p>
        </section>

        <section className="stats-grid" aria-label="Travel statistics">
          <StatCard icon={<Route size={20} />} label="Journeys" value={String(stats.journeys)} detail={`${stats.railJourneys} rail · ${stats.airJourneys} air`} />
          <StatCard icon={<CircleGauge size={20} />} label="Distance" value={`${stats.distanceKm.toLocaleString("en-GB")} km`} detail="Approximate distance" />
          <StatCard icon={<Globe2 size={20} />} label="Countries" value={String(stats.countries)} detail="Borders crossed" />
          <StatCard icon={<MapPin size={20} />} label="Places" value={String(stats.places)} detail="Stations & airports" />
        </section>

        <section className="map-card" id="map" aria-labelledby="map-title">
          <div className="map-card__header">
            <div>
              <span className="section-kicker">The big picture</span>
              <h2 id="map-title">Journey map</h2>
            </div>
            <div className="mode-filter" aria-label="Filter map by travel mode">
              {(["all", "rail", "air"] as const).map((filterMode) => (
                <button
                  type="button"
                  key={filterMode}
                  className={mode === filterMode ? "is-active" : ""}
                  aria-pressed={mode === filterMode}
                  onClick={() => setMode(filterMode)}
                >
                  {filterMode === "rail" && <TrainFront size={14} />}
                  {filterMode === "air" && <Plane size={14} />}
                  {filterMode === "all" ? "All routes" : filterMode}
                </button>
              ))}
            </div>
          </div>

          <div className="map-stage">
            <MapShell legs={visibleLegs} />
            {legs.length === 0 ? (
              <div className="map-empty-state">
                <span><Route size={23} /></span>
                <strong>Your map is ready</strong>
                <p>Add your first journey to draw a line across it.</p>
                <button type="button" onClick={jumpToAddJourney}>Add a journey <ArrowRight size={14} /></button>
              </div>
            ) : (
              <>
                <div className="map-legend">
                  <span><i className="map-legend__rail" /> Rail</span>
                  <span><i className="map-legend__air" /> Air</span>
                </div>
                <div className="map-count"><strong>{visibleLegs.length}</strong> journeys shown</div>
              </>
            )}
          </div>

          <div className="map-storage-note">
            <span>
              {persistence === "database" ? <Cloud size={15} /> : <HardDrive size={15} />}
              {persistence === "database" ? "Supabase + browser backup" : "Private by default"}
            </span>
            <div className="journal-backup">
              <span className="journal-backup__status" role="status" aria-live="polite">
                {backupStatus || (persistence === "database"
                  ? "Journeys sync to Supabase and remain backed up in this browser."
                  : "Back up your browser journal regularly.")}
              </span>
              <select
                value={importMode}
                onChange={(event) => setImportMode(event.target.value as "merge" | "replace")}
                aria-label="How to import a journal backup"
              >
                <option value="merge">Merge import</option>
                <option value="replace">Replace import</option>
              </select>
              <button type="button" onClick={exportJournal}>
                <Download size={14} /> Export
              </button>
              <button type="button" onClick={() => importInputRef.current?.click()}>
                <Upload size={14} /> Import
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                onChange={importJournal}
                hidden
              />
            </div>
          </div>
        </section>

        <div className="lower-grid">
        <AddJourney onAdd={addLeg} persistence={persistence} />
          <JourneyList legs={legs} onRemove={removeLeg} />
        </div>

        <footer className="site-footer">
          <a className="brand brand--small" href="#overview"><BrandMark /><span>rail log</span></a>
          <p>Every journey leaves a line.</p>
          <span>Places: <a href="https://github.com/trainline-eu/stations" target="_blank" rel="noreferrer">Trainline EU</a> · <a href="https://ourairports.com/data/" target="_blank" rel="noreferrer">OurAirports</a></span>
        </footer>
      </main>
    </div>
  );
}
