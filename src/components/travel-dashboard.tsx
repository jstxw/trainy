"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Cloud,
  Download,
  HardDrive,
  Map as MapIcon,
  MapPin,
  PanelLeftClose,
  Plane,
  Plus,
  Route,
  Search,
  TrainFront,
  Trash2,
  Upload,
  X,
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
type PanelView = "journal" | "detail" | "add";

function formatDate(value: string, long = false) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: long ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function formatTime(value?: string) {
  if (!value) return "--:--";
  const match = value.match(/\d{2}:\d{2}/);
  return match?.[0] ?? value.slice(0, 5);
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

function journeyYearLabel(legs: JourneyLeg[]) {
  const years = new Set(legs.map((leg) => leg.travelDate.slice(0, 4)));
  if (years.size === 1) return `${Array.from(years)[0]} passport`;
  return "All-time passport";
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
        const response = await fetch(
          `/api/places/search?kind=${kind}&q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal },
        );
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
    <label className="place-field">
      <span className="field-label">{label}</span>
      <div className="place-field__control">
        <MapPin size={15} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            onChange(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 140)}
          placeholder={kind === "station" ? "Stuttgart Hbf" : "STR or Stuttgart"}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && query.trim().length >= 2}
          aria-controls={listId}
          aria-autocomplete="list"
          required
        />
        {value && <Check className="place-field__check" size={15} aria-hidden="true" />}
      </div>

      {open && query.trim().length >= 2 && !value && (
        <div className="place-results" id={listId} role="listbox">
          {loading ? (
            <p>Searching places…</p>
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
                {kind === "station" ? <TrainFront size={15} /> : <Plane size={15} />}
                <span>
                  <strong>{place.name}</strong>
                  <small>{place.city !== place.name ? `${place.city} · ` : ""}{place.country}</small>
                </span>
                <code>{place.code}</code>
              </button>
            ))
          ) : (
            <p>No matching place. Try a nearby city or station code.</p>
          )}
        </div>
      )}
    </label>
  );
}

function AddJourney({
  onAdd,
  onBack,
  persistence,
}: {
  onAdd: (leg: JourneyLeg) => void;
  onBack: () => void;
  persistence: PersistenceMode;
}) {
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<TravelMode>("rail");
  const [operator, setOperator] = useState("");
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

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
        body: JSON.stringify({ mode, number, travelDate: date, operator, origin, destination }),
      });
      const data = (await response.json()) as { leg?: JourneyLeg };
      if (!response.ok || !data.leg) throw new Error("Could not add journey");
      onAdd(data.leg);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="panel-view panel-view--form">
      <div className="panel-view__header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Back to journeys">
          <ArrowLeft size={19} />
        </button>
        <div>
          <span className="section-label">New entry</span>
          <h1>Add a journey</h1>
        </div>
      </div>

      <form className="journey-form" onSubmit={submitJourney}>
        <div className="mode-switch mode-switch--form" aria-label="Journey mode">
          <button className={mode === "rail" ? "is-active" : ""} type="button" onClick={() => changeMode("rail")}>
            <TrainFront size={15} /> Rail
          </button>
          <button className={mode === "air" ? "is-active" : ""} type="button" onClick={() => changeMode("air")}>
            <Plane size={15} /> Air
          </button>
        </div>

        <div className="form-grid">
          <label>
            <span className="field-label">{mode === "rail" ? "Train" : "Flight"} number</span>
            <input
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              placeholder={mode === "rail" ? "ICE 573" : "KL 1776"}
              autoComplete="off"
              required
            />
          </label>
          <label>
            <span className="field-label">Travel date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </label>
        </div>

        <PlaceCombobox label="From" kind={mode === "rail" ? "station" : "airport"} value={origin} onChange={setOrigin} excludeId={destination?.id} />
        <PlaceCombobox label="To" kind={mode === "rail" ? "station" : "airport"} value={destination} onChange={setDestination} excludeId={origin?.id} />

        <label>
          <span className="field-label">Operator <small>optional</small></span>
          <input
            value={operator}
            onChange={(event) => setOperator(event.target.value)}
            placeholder={mode === "rail" ? "Deutsche Bahn" : "KLM"}
          />
        </label>

        <button className="primary-action" disabled={status === "loading" || !origin || !destination}>
          {status === "loading" ? "Adding journey…" : "Add to passport"}
          {status !== "loading" && <ArrowRight size={17} />}
        </button>

        {status === "error" && <p className="form-error" role="alert">Choose two different places and try again.</p>}
      </form>

      <p className="persistence-note">
        {persistence === "database" ? <Cloud size={13} /> : <HardDrive size={13} />}
        {persistence === "database" ? "Syncs to Supabase and this browser" : "Saved privately in this browser"}
      </p>
    </div>
  );
}

function JourneyDetail({
  leg,
  onBack,
  onRemove,
}: {
  leg: JourneyLeg;
  onBack: () => void;
  onRemove: (id: string) => void;
}) {
  const stops = leg.stops.length > 0
    ? leg.stops
    : [
        { place: leg.origin, sequence: 0, boarded: true },
        { place: leg.destination, sequence: 1, boarded: true },
      ];

  return (
    <div className="panel-view panel-view--detail">
      <div className="panel-view__header detail-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Back to journeys"><ArrowLeft size={19} /></button>
        <div>
          <span className="section-label">{formatDate(leg.travelDate, true)}</span>
          <h1>{leg.number}</h1>
        </div>
        <span className={`mode-badge mode-badge--${leg.mode}`}>
          {leg.mode === "rail" ? <TrainFront size={14} /> : <Plane size={14} />}{leg.mode}
        </span>
      </div>

      <section className="departure-card" aria-label={`${leg.origin.name} to ${leg.destination.name}`}>
        <div className="departure-card__topline">
          <span>{leg.operator || (leg.mode === "rail" ? "Rail service" : "Flight")}</span>
          <strong>{leg.number}</strong>
        </div>
        <div className="departure-route">
          <div>
            <span className="route-code">{leg.origin.code || "ORG"}</span>
            <h2>{leg.origin.city}</h2>
            <p>{leg.origin.name}</p>
          </div>
          <span className="route-arrow" aria-hidden="true"><i /><ChevronRight size={18} /></span>
          <div>
            <span className="route-code">{leg.destination.code || "DST"}</span>
            <h2>{leg.destination.city}</h2>
            <p>{leg.destination.name}</p>
          </div>
        </div>
      </section>

      <div className="detail-stats">
        <div><span>Distance</span><strong>{leg.distanceKm.toLocaleString("en-GB")} km</strong></div>
        <div><span>Stops</span><strong>{stops.length}</strong></div>
        <div><span>Source</span><strong>{leg.source}</strong></div>
      </div>

      <section className="calling-points" aria-labelledby="calling-points-title">
        <div className="section-heading">
          <div><span className="section-label">Route</span><h2 id="calling-points-title">Calling points</h2></div>
          <span>{stops.length} stops</span>
        </div>
        <ol>
          {stops.map((stop, index) => (
            <li key={`${stop.place.id}-${stop.sequence}`}>
              <time>{formatTime(stop.departure ?? stop.arrival)}</time>
              <span className="calling-points__track" aria-hidden="true"><i /></span>
              <div><strong>{stop.place.name}</strong><span>{stop.place.city} · {stop.place.country}</span></div>
              {(index === 0 || index === stops.length - 1) && <small>{index === 0 ? "DEPART" : "ARRIVE"}</small>}
            </li>
          ))}
        </ol>
      </section>

      <button className="danger-action" type="button" onClick={() => onRemove(leg.id)}><Trash2 size={15} /> Delete journey</button>
    </div>
  );
}

function JourneyJournal({
  legs,
  stats,
  mode,
  query,
  onModeChange,
  onQueryChange,
  onSelect,
  onAdd,
}: {
  legs: JourneyLeg[];
  stats: TravelStats;
  mode: ModeFilter;
  query: string;
  onModeChange: (mode: ModeFilter) => void;
  onQueryChange: (query: string) => void;
  onSelect: (leg: JourneyLeg) => void;
  onAdd: () => void;
}) {
  return (
    <div className="panel-view panel-view--journal">
      <section className="passport-summary">
        <span className="section-label">{journeyYearLabel(legs)}</span>
        <div className="passport-summary__title">
          <h1>Your journeys</h1>
          <button className="add-button" type="button" onClick={onAdd}><Plus size={16} /> Add</button>
        </div>
        <div className="passport-stats" aria-label="Travel summary">
          <div><strong>{stats.journeys}</strong><span>Journeys</span></div>
          <div><strong>{stats.distanceKm.toLocaleString("en-GB")}</strong><span>Kilometres</span></div>
          <div><strong>{stats.places}</strong><span>Places</span></div>
        </div>
      </section>

      <div className="journal-controls">
        <label className="journey-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search journeys</span>
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search train, city or station" />
          {query && <button type="button" onClick={() => onQueryChange("")} aria-label="Clear search"><X size={14} /></button>}
        </label>
        <div className="mode-switch" aria-label="Filter journeys by mode">
          {(["all", "rail", "air"] as const).map((filterMode) => (
            <button
              type="button"
              key={filterMode}
              className={mode === filterMode ? "is-active" : ""}
              aria-pressed={mode === filterMode}
              onClick={() => onModeChange(filterMode)}
            >
              {filterMode === "rail" && <TrainFront size={13} />}
              {filterMode === "air" && <Plane size={13} />}
              {filterMode === "all" ? "All" : filterMode === "rail" ? "Rail" : "Air"}
            </button>
          ))}
        </div>
      </div>

      <section className="journey-board" aria-labelledby="journeys-title">
        <div className="section-heading section-heading--board">
          <div><span className="section-label">Journal</span><h2 id="journeys-title">Recent journeys</h2></div>
          <span>{legs.length} shown</span>
        </div>

        {legs.length === 0 ? (
          <div className="journal-empty">
            <span><Route size={21} /></span>
            <strong>No journeys here</strong>
            <p>{query ? "Try a different search." : "Add a journey to draw your first line."}</p>
            {!query && <button type="button" onClick={onAdd}>Add journey</button>}
          </div>
        ) : (
          <div className="journey-list">
            {legs.map((leg) => (
              <button className="journey-row" data-mode={leg.mode} type="button" key={leg.id} onClick={() => onSelect(leg)}>
                <span className="journey-row__number">{leg.number}</span>
                <span className="journey-row__route">
                  <strong>{leg.origin.city}</strong><i aria-hidden="true" /><strong>{leg.destination.city}</strong>
                  <small>{leg.operator || (leg.mode === "rail" ? "Rail service" : "Flight")}</small>
                </span>
                <span className="journey-row__meta"><time>{formatDate(leg.travelDate)}</time><small>{leg.distanceKm.toLocaleString("en-GB")} km</small></span>
                <ChevronRight className="journey-row__chevron" size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function TravelDashboard({ initialLegs, persistence }: { initialLegs: JourneyLeg[]; persistence: PersistenceMode }) {
  const [legs, setLegs] = useState(initialLegs);
  const [mode, setMode] = useState<ModeFilter>("all");
  const [query, setQuery] = useState("");
  const [panelView, setPanelView] = useState<PanelView>("journal");
  const [selectedLegId, setSelectedLegId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
          if (!response.ok || !data.legs?.every(isJourneyLeg)) throw new Error("Migration failed");
          setLegs(data.legs);
          setBackupStatus(data.migrated ? `Migrated ${data.migrated} journeys to Supabase.` : "Browser backup retained.");
        })
        .catch(() => {
          setLegs(validLegs);
          setBackupStatus("Supabase migration failed; using the browser backup.");
        });
    } catch {
      // Ignore unavailable or malformed browser storage.
    }
  }, [initialLegs.length, persistence]);

  const stats = useMemo(() => statsFor(legs), [legs]);
  const visibleLegs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return [...legs]
      .filter((leg) => mode === "all" || leg.mode === mode)
      .filter((leg) => {
        if (!normalizedQuery) return true;
        return [leg.number, leg.operator, leg.origin.name, leg.origin.city, leg.destination.name, leg.destination.city]
          .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => b.travelDate.localeCompare(a.travelDate));
  }, [legs, mode, query]);
  const mapLegs = useMemo(() => legs.filter((leg) => mode === "all" || leg.mode === mode), [legs, mode]);
  const selectedLeg = legs.find((leg) => leg.id === selectedLegId) ?? null;

  function saveLegs(nextLegs: JourneyLeg[]) {
    try { window.localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(nextLegs)); } catch { /* In-memory state still works. */ }
  }

  function showJournal() {
    setPanelView("journal");
    setSelectedLegId(null);
  }

  function selectLeg(leg: JourneyLeg) {
    setSelectedLegId(leg.id);
    setPanelView("detail");
    setSidebarOpen(true);
  }

  function addLeg(leg: JourneyLeg) {
    setLegs((current) => {
      const nextLegs = current.some((item) => item.id === leg.id) ? current : [...current, leg];
      saveLegs(nextLegs);
      return nextLegs;
    });
    setSelectedLegId(leg.id);
    setPanelView("detail");
  }

  async function removeLeg(id: string) {
    const previousLegs = legs;
    const nextLegs = legs.filter((leg) => leg.id !== id);
    setLegs(nextLegs);
    saveLegs(nextLegs);
    showJournal();

    if (persistence === "database") {
      try {
        const response = await fetch(`/api/legs?id=${encodeURIComponent(id)}`, { method: "DELETE" });
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
      let nextLegs = importMode === "replace" ? backup.journeys : mergeJourneys(legs, backup.journeys);
      if (persistence === "database") {
        const response = await fetch("/api/legs/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ journeys: nextLegs, replaceExisting: importMode === "replace" }),
        });
        const data = (await response.json()) as { legs?: JourneyLeg[]; error?: string };
        if (!response.ok || !data.legs?.every(isJourneyLeg)) throw new Error(data.error || "Import failed");
        nextLegs = data.legs;
      }
      saveLegs(nextLegs);
      setLegs(nextLegs);
      setBackupStatus(`${importMode === "replace" ? "Restored" : "Merged"} ${backup.journeys.length} journeys.`);
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : "Could not import this backup.");
    }
  }

  return (
    <main className={`map-workspace ${sidebarOpen ? "has-sidebar" : "is-map-only"}`}>
      <div className="map-canvas" aria-label="Journey map">
        <MapShell legs={mapLegs} selectedLegId={selectedLegId} sidebarOpen={sidebarOpen} onSelectLeg={(id) => {
          const leg = legs.find((candidate) => candidate.id === id);
          if (leg) selectLeg(leg);
        }} />

        {!sidebarOpen && (
          <button className="show-sidebar" type="button" onClick={() => setSidebarOpen(true)}>
            <BrandMark /><span>Open journeys</span>
          </button>
        )}

        <div className="map-status" aria-live="polite">
          <span><i className="map-status__rail" /> {mode === "air" ? 0 : mapLegs.filter((leg) => leg.mode === "rail").length} rail</span>
          <span><i className="map-status__air" /> {mode === "rail" ? 0 : mapLegs.filter((leg) => leg.mode === "air").length} air</span>
        </div>

        {legs.length === 0 && (
          <div className="map-empty-state">
            <span><Route size={22} /></span><strong>Your map is ready</strong><p>Add a journey to draw your first line.</p>
            <button type="button" onClick={() => { setSidebarOpen(true); setPanelView("add"); }}>Add journey <ArrowRight size={14} /></button>
          </div>
        )}
      </div>

      {sidebarOpen && (
        <aside className="journey-sidebar" aria-label="Journey information">
          <header className="sidebar-header">
            <button className="brand" type="button" onClick={showJournal} aria-label="Rail Log journeys"><BrandMark /><span>rail log</span></button>
            <div className="sidebar-header__actions">
              <span className="sync-indicator" title={persistence === "database" ? "Supabase journal" : "Local journal"}><i /> {persistence === "database" ? "Synced" : "Private"}</span>
              <button className="icon-button sidebar-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="Hide journey panel"><PanelLeftClose size={18} /></button>
            </div>
          </header>

          <div className="sidebar-scroll">
            {panelView === "journal" && (
              <JourneyJournal
                legs={visibleLegs}
                stats={stats}
                mode={mode}
                query={query}
                onModeChange={(nextMode) => { setMode(nextMode); setSelectedLegId(null); }}
                onQueryChange={setQuery}
                onSelect={selectLeg}
                onAdd={() => setPanelView("add")}
              />
            )}
            {panelView === "add" && <AddJourney onAdd={addLeg} onBack={showJournal} persistence={persistence} />}
            {panelView === "detail" && selectedLeg && <JourneyDetail leg={selectedLeg} onBack={showJournal} onRemove={removeLeg} />}
          </div>

          <footer className="sidebar-footer">
            <span className="backup-status" role="status">{backupStatus}</span>
            <div className="backup-actions">
              <select value={importMode} onChange={(event) => setImportMode(event.target.value as "merge" | "replace")} aria-label="Journal import mode">
                <option value="merge">Merge</option><option value="replace">Replace</option>
              </select>
              <button type="button" onClick={exportJournal}><Download size={14} /> Export</button>
              <button type="button" onClick={() => importInputRef.current?.click()}><Upload size={14} /> Import</button>
              <input ref={importInputRef} type="file" accept="application/json,.json" onChange={importJournal} hidden />
            </div>
          </footer>
        </aside>
      )}

      <div className="mobile-map-label" aria-hidden="true"><MapIcon size={14} /> Map</div>
    </main>
  );
}
