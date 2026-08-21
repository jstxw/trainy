"use client";

import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleGauge,
  Globe2,
  MapPin,
  Plane,
  Plus,
  Route,
  Search,
  TrainFront,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { MapShell } from "@/components/map-shell";
import type {
  JourneyLeg,
  Place,
  TravelMode,
  TravelStats,
  TripCandidate,
} from "@/lib/domain";

type ModeFilter = "all" | TravelMode;

const monthLabels: Record<number, string> = {
  6: "June",
  7: "July",
  8: "August",
};

function formatDate(value: string, compact = false) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: compact ? "short" : "long",
    year: compact ? undefined : "numeric",
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

function AddJourney({
  places,
  onAdd,
}: {
  places: Place[];
  onAdd: (leg: JourneyLeg) => void;
}) {
  const [entryMode, setEntryMode] = useState<"lookup" | "manual">("lookup");
  const [number, setNumber] = useState("ICE 573");
  const [date, setDate] = useState("2026-07-14");
  const [manualMode, setManualMode] = useState<TravelMode>("rail");
  const [operator, setOperator] = useState("");
  const [originId, setOriginId] = useState("hamburg");
  const [destinationId, setDestinationId] = useState("basel");
  const [candidate, setCandidate] = useState<TripCandidate | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "found" | "empty" | "added" | "error">("idle");

  const eligiblePlaces = places.filter((place) => place.kind === (manualMode === "rail" ? "station" : "airport"));

  function switchEntryMode(mode: "lookup" | "manual") {
    setEntryMode(mode);
    setCandidate(null);
    setStatus("idle");

    if (mode === "manual" && manualMode === "air") {
      const airports = places.filter((place) => place.kind === "airport");
      setOriginId(airports[0]?.id ?? "");
      setDestinationId(airports[1]?.id ?? "");
    }
  }

  function changeManualMode(mode: TravelMode) {
    const matchingPlaces = places.filter((place) => place.kind === (mode === "rail" ? "station" : "airport"));
    setManualMode(mode);
    setOriginId(matchingPlaces[0]?.id ?? "");
    setDestinationId(matchingPlaces[1]?.id ?? "");
  }

  async function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setCandidate(null);

    try {
      const query = new URLSearchParams({ number, date });
      const response = await fetch(`/api/lookup?${query}`);
      const data = (await response.json()) as {
        candidates?: TripCandidate[];
        error?: string;
      };

      if (!response.ok) throw new Error(data.error || "Lookup failed");
      const firstCandidate = data.candidates?.[0] ?? null;
      setCandidate(firstCandidate);
      setStatus(firstCandidate ? "found" : "empty");
    } catch {
      setStatus("error");
    }
  }

  async function confirmCandidate() {
    if (!candidate) return;
    setStatus("loading");

    try {
      const response = await fetch("/api/legs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripIndexId: candidate.tripIndexId }),
      });
      const data = (await response.json()) as { leg?: JourneyLeg };
      if (!response.ok || !data.leg) throw new Error("Could not add journey");
      onAdd(data.leg);
      setStatus("added");
      setCandidate(null);
    } catch {
      setStatus("error");
    }
  }

  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");

    try {
      const response = await fetch("/api/legs/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: manualMode,
          number,
          travelDate: date,
          operator,
          originId,
          destinationId,
        }),
      });
      const data = (await response.json()) as { leg?: JourneyLeg };
      if (!response.ok || !data.leg) throw new Error("Could not add journey");
      onAdd(data.leg);
      setStatus("added");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="add-card" id="add-journey" aria-labelledby="add-journey-title">
      <div className="add-card__heading">
        <span className="section-kicker">New entry</span>
        <h2 id="add-journey-title">Add a journey</h2>
        <p>Find it in the timetable archive or enter it yourself.</p>
      </div>

      <div className="entry-tabs" role="tablist" aria-label="Journey entry method">
        <button
          type="button"
          role="tab"
          aria-selected={entryMode === "lookup"}
          className={entryMode === "lookup" ? "is-active" : ""}
          onClick={() => switchEntryMode("lookup")}
        >
          <Search size={15} /> Lookup
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={entryMode === "manual"}
          className={entryMode === "manual" ? "is-active" : ""}
          onClick={() => switchEntryMode("manual")}
        >
          <Plus size={15} /> Manual
        </button>
      </div>

      {entryMode === "lookup" ? (
        <form className="journey-form" onSubmit={submitLookup}>
          <label>
            <span>Train number</span>
            <div className="field-with-icon">
              <TrainFront size={17} />
              <input
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                placeholder="e.g. ICE 573"
                autoComplete="off"
                required
              />
            </div>
          </label>
          <label>
            <span>Travel date</span>
            <div className="field-with-icon">
              <CalendarDays size={17} />
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>
          </label>
          <button className="primary-button primary-button--wide" disabled={status === "loading"}>
            {status === "loading" ? "Searching…" : "Find journey"}
            {status !== "loading" && <ArrowRight size={17} />}
          </button>
        </form>
      ) : (
        <form className="journey-form" onSubmit={submitManual}>
          <div className="mode-choice" aria-label="Journey mode">
            <button
              className={manualMode === "rail" ? "is-active" : ""}
              type="button"
              onClick={() => changeManualMode("rail")}
            >
              <TrainFront size={16} /> Rail
            </button>
            <button
              className={manualMode === "air" ? "is-active" : ""}
              type="button"
              onClick={() => changeManualMode("air")}
            >
              <Plane size={16} /> Air
            </button>
          </div>
          <div className="form-row">
            <label>
              <span>Number</span>
              <input value={number} onChange={(event) => setNumber(event.target.value)} required />
            </label>
            <label>
              <span>Date</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>
          </div>
          <label>
            <span>Operator <small>optional</small></span>
            <input value={operator} onChange={(event) => setOperator(event.target.value)} placeholder="e.g. Deutsche Bahn" />
          </label>
          <div className="form-row">
            <label>
              <span>From</span>
              <select value={originId} onChange={(event) => setOriginId(event.target.value)}>
                {eligiblePlaces.map((place) => <option key={place.id} value={place.id}>{place.city}</option>)}
              </select>
            </label>
            <label>
              <span>To</span>
              <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
                {eligiblePlaces.map((place) => <option key={place.id} value={place.id}>{place.city}</option>)}
              </select>
            </label>
          </div>
          <button className="primary-button primary-button--wide" disabled={status === "loading"}>
            {status === "loading" ? "Adding…" : "Add to journal"}
            {status !== "loading" && <ArrowRight size={17} />}
          </button>
        </form>
      )}

      <div className="form-feedback" aria-live="polite">
        {status === "found" && candidate && (
          <div className="candidate-card">
            <div className="candidate-card__icon"><TrainFront size={18} /></div>
            <div className="candidate-card__body">
              <span>{candidate.number} · {formatDate(candidate.travelDate, true)}</span>
              <strong>{candidate.origin.city} <ArrowRight size={14} /> {candidate.destination.city}</strong>
              <small>{candidate.stops.length} stops · {candidate.distanceKm.toLocaleString("en-GB")} km</small>
            </div>
            <button type="button" onClick={confirmCandidate} aria-label={`Add ${candidate.number} to journal`}>
              <Plus size={17} />
            </button>
          </div>
        )}
        {status === "empty" && (
          <p className="feedback-note">No timetable match. <button type="button" onClick={() => switchEntryMode("manual")}>Add it manually</button>.</p>
        )}
        {status === "added" && <p className="feedback-note feedback-note--success"><Check size={15} /> Added to this demo journal.</p>}
        {status === "error" && <p className="feedback-note feedback-note--error">Something went wrong. Please try again.</p>}
      </div>

      <p className="demo-note"><span /> Demo mode · connect Postgres to persist entries</p>
    </section>
  );
}

function JourneyList({ legs }: { legs: JourneyLeg[] }) {
  const recent = [...legs].sort((a, b) => b.travelDate.localeCompare(a.travelDate)).slice(0, 5);

  return (
    <section className="journal-card" id="journal" aria-labelledby="journal-title">
      <div className="card-heading-row">
        <div>
          <span className="section-kicker">Journal</span>
          <h2 id="journal-title">Recent journeys</h2>
        </div>
        <button className="icon-button" type="button" title="Open all journeys" aria-label="Open all journeys">
          <ChevronRight size={19} />
        </button>
      </div>

      <div className="journey-list">
        {recent.map((leg) => (
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
              <time dateTime={leg.travelDate}>{formatDate(leg.travelDate, true)}</time>
              <span>{leg.distanceKm ? `${leg.distanceKm.toLocaleString("en-GB")} km` : "—"}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function TravelDashboard({
  initialLegs,
  places,
}: {
  initialLegs: JourneyLeg[];
  places: Place[];
}) {
  const [legs, setLegs] = useState(initialLegs);
  const [mode, setMode] = useState<ModeFilter>("all");
  const [throughMonth, setThroughMonth] = useState(8);

  const visibleLegs = useMemo(
    () => legs.filter((leg) => {
      const legMonth = Number(leg.travelDate.slice(5, 7));
      return legMonth <= throughMonth && (mode === "all" || leg.mode === mode);
    }),
    [legs, mode, throughMonth],
  );
  const stats = useMemo(() => statsFor(visibleLegs), [visibleLegs]);

  function addLeg(leg: JourneyLeg) {
    setLegs((current) => current.some((item) => item.id === leg.id) ? current : [...current, leg]);
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
          <span className="demo-pill"><i /> Demo journal</span>
          <button type="button" className="primary-button primary-button--compact" onClick={jumpToAddJourney}>
            <Plus size={16} /> Add journey
          </button>
        </div>
      </header>

      <main id="overview">
        <section className="hero-section">
          <div>
            <span className="eyebrow"><span /> Summer 2026 · Europe</span>
            <h1>Your summer,<br /><em>drawn in lines.</em></h1>
          </div>
          <p>
            A living record of every platform, border, and long way home —
            from the first departure to the last arrival.
          </p>
        </section>

        <section className="stats-grid" aria-label="Travel statistics">
          <StatCard icon={<Route size={20} />} label="Journeys" value={String(stats.journeys)} detail={`${stats.railJourneys} rail · ${stats.airJourneys} air`} />
          <StatCard icon={<CircleGauge size={20} />} label="Distance" value={`${stats.distanceKm.toLocaleString("en-GB")} km`} detail="Across the continent" />
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
            <div className="map-legend">
              <span><i className="map-legend__rail" /> Rail</span>
              <span><i className="map-legend__air" /> Air</span>
            </div>
            <div className="map-count"><strong>{visibleLegs.length}</strong> journeys shown</div>
          </div>

          <div className="timeline-control">
            <div className="timeline-control__labels">
              <span><CalendarDays size={15} /> Summer timeline</span>
              <strong>Through {monthLabels[throughMonth]} 2026</strong>
            </div>
            <div className="timeline-slider-wrap">
              <input
                aria-label="Show journeys through month"
                type="range"
                min="6"
                max="8"
                step="1"
                value={throughMonth}
                onChange={(event) => setThroughMonth(Number(event.target.value))}
                style={{ "--timeline-progress": `${((throughMonth - 6) / 2) * 100}%` } as CSSProperties}
              />
              <div className="timeline-months" aria-hidden="true"><span>Jun</span><span>Jul</span><span>Aug</span></div>
            </div>
          </div>
        </section>

        <div className="lower-grid">
          <AddJourney places={places} onAdd={addLeg} />
          <JourneyList legs={visibleLegs} />
        </div>

        <footer className="site-footer">
          <a className="brand brand--small" href="#overview"><BrandMark /><span>rail log</span></a>
          <p>Every journey leaves a line.</p>
          <span>Built around GTFS · MapLibre · PostGIS</span>
        </footer>
      </main>
    </div>
  );
}
