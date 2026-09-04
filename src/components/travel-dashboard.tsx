"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type SubmitEvent,
} from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  Map as MapIcon,
  MapPin,
  PanelLeftClose,
  Pencil,
  Plane,
  Plus,
  MoveUpRight,
  Search,
  Spline,
  TrainFront,
  Trash2,
  X,
} from "lucide-react";
import { AccountChip, type Account } from "@/components/account-chip";
import { MapShell, type MapView } from "@/components/map-shell";
import type { RailPathStyle } from "@/lib/rail-path";
import type {
  JourneyLeg,
  PersistenceMode,
  Place,
  TravelMode,
  TravelStats,
} from "@/lib/domain";
import {
  isJourneyLeg,
  JOURNAL_STORAGE_KEY,
} from "@/lib/journal-backup";
import { calculateJourneyStats, railLegDurationMinutes } from "@/lib/journey-stats";
import { estimatedFlightMinutes, estimatedRailDistance } from "@/lib/journey-distance";
import { operatorLogoUrl, searchRailOperators } from "@/lib/rail-operators";
import { operatorInitials, searchAirlines } from "@/lib/airlines";

type ModeFilter = "all" | TravelMode;
type PanelView = "journal" | "detail" | "add" | "edit";

const PATH_STYLE_STORAGE_KEY = "rail-log:path-style:v1";
const MAP_VIEW_STORAGE_KEY = "rail-log:map-view:v1";
const ROUTE_REFRESH_STORAGE_KEY = "rail-log:route-refresh:v1";

// Rail legs saved before route lookup existed carry a straight line and no
// calling points; re-saving them through the manual endpoint backfills both.
function needsRouteRefresh(leg: JourneyLeg) {
  return (
    leg.mode === "rail" &&
    leg.source === "manual" &&
    (
      leg.railDistanceKm === undefined ||
      leg.stops.length <= 2 ||
      leg.stops.every((stop) => !stop.arrival && !stop.departure)
    )
  );
}

function formatRailDistance(leg: JourneyLeg) {
  return leg.railDistanceKm !== undefined
    ? `${leg.railDistanceKm.toLocaleString("en-GB")}`
    : `~${estimatedRailDistance(leg.distanceKm).toLocaleString("en-GB")}`;
}

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

function formatDuration(minutes: number) {
  if (minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes.toString().padStart(2, "0")}m`;
}

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

function countryName(code: string) {
  try {
    return REGION_NAMES.of(code) ?? code;
  } catch {
    return code;
  }
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T12:00:00.000Z`));
}

function PlaceCombobox({
  label,
  kind,
  value,
  onChange,
  recentPlaces,
  excludeId,
}: {
  label: string;
  kind: Place["kind"];
  value: Place | null;
  onChange: (place: Place | null) => void;
  recentPlaces: Place[];
  excludeId?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState(value?.name ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const matchingRecentPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return recentPlaces.filter((place) => {
      if (place.id === excludeId) return false;
      if (!normalizedQuery) return true;
      return [place.name, place.city, place.code]
        .some((field) => field.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [excludeId, query, recentPlaces]);
  const optionPlaces = useMemo(() => {
    const combined = new Map<string, Place>();
    for (const place of matchingRecentPlaces) combined.set(place.id, place);
    if (query.trim().length >= 2) {
      for (const place of results) combined.set(place.id, place);
    }
    return Array.from(combined.values()).slice(0, 12);
  }, [matchingRecentPlaces, query, results]);
  const showOptions = open && !value && (query.trim().length >= 2 || optionPlaces.length > 0);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2 || (value && trimmedQuery === value.name)) {
      return;
    }

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
    setActiveIndex(-1);
    onChange(place);
  }

  function moveActive(direction: 1 | -1) {
    if (optionPlaces.length === 0) return;
    setOpen(true);
    setActiveIndex((current) => {
      if (current < 0) return direction === 1 ? 0 : optionPlaces.length - 1;
      return (current + direction + optionPlaces.length) % optionPlaces.length;
    });
  }

  return (
    <label className="place-field">
      <span className="field-label">{label}</span>
      <div className="place-field__control">
        <MapPin size={15} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setResults([]);
            setLoading(nextQuery.trim().length >= 2);
            setOpen(true);
            setActiveIndex(-1);
            onChange(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 140)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveActive(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveActive(-1);
            } else if (event.key === "Enter" && activeIndex >= 0 && optionPlaces[activeIndex]) {
              event.preventDefault();
              selectPlace(optionPlaces[activeIndex]);
            } else if (event.key === "Escape") {
              setOpen(false);
              setActiveIndex(-1);
            }
          }}
          placeholder={kind === "station" ? "Stuttgart Hbf" : "STR or Stuttgart"}
          autoComplete="off"
          role="combobox"
          aria-expanded={showOptions}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
          required
        />
        {value && <Check className="place-field__check" size={15} aria-hidden="true" />}
      </div>

      {showOptions && (
        <div className="place-results" id={listId} role="listbox">
          {matchingRecentPlaces.length > 0 && (
            <span className="place-results__label">
              {query.trim().length < 2 ? "Recent places" : "Recent matches"}
            </span>
          )}
          {loading && optionPlaces.length === 0 ? (
            <p>Searching places…</p>
          ) : optionPlaces.length ? (
            optionPlaces.map((place, index) => (
              <button
                type="button"
                role="option"
                id={`${listId}-option-${index}`}
                aria-selected={activeIndex === index}
                className={activeIndex === index ? "is-active" : ""}
                key={place.id}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
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

function OperatorCombobox({
  mode,
  value,
  onChange,
}: {
  mode: TravelMode;
  value: string;
  onChange: (operator: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const options = useMemo(
    () => mode === "rail" ? searchRailOperators(value) : searchAirlines(value),
    [mode, value],
  );
  const showOptions = open && options.length > 0;

  function selectOperator(name: string) {
    onChange(name);
    setOpen(false);
    setActiveIndex(-1);
  }

  function moveActive(direction: 1 | -1) {
    if (options.length === 0) return;
    setOpen(true);
    setActiveIndex((current) => {
      if (current < 0) return direction === 1 ? 0 : options.length - 1;
      return (current + direction + options.length) % options.length;
    });
  }

  return (
    <label className="place-field">
      <span className="field-label">{mode === "rail" ? "Operator" : "Airline"} <small>optional</small></span>
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 140)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveActive(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            moveActive(-1);
          } else if (event.key === "Enter" && activeIndex >= 0 && options[activeIndex]) {
            event.preventDefault();
            selectOperator(options[activeIndex].name);
          } else if (event.key === "Escape") {
            setOpen(false);
            setActiveIndex(-1);
          }
        }}
        placeholder={mode === "rail" ? "Deutsche Bahn" : "KLM"}
        autoComplete="off"
        role="combobox"
        aria-expanded={showOptions}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
        aria-autocomplete="list"
      />

      {showOptions && (
        <div className="place-results" id={listId} role="listbox">
          {options.map((operator, index) => (
            <button
              type="button"
              role="option"
              id={`${listId}-option-${index}`}
              aria-selected={activeIndex === index}
              className={activeIndex === index ? "is-active" : ""}
              key={operator.name}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectOperator(operator.name)}
            >
              {mode === "rail" ? <TrainFront size={15} /> : <Plane size={15} />}
              <span><strong>{operator.name}</strong></span>
              <code>{operator.code ?? operator.country}</code>
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

const CALENDAR_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseCalendarDate(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12);
}

function calendarDateValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function DatePicker({
  value,
  onChange,
  min,
  max,
  disabled = false,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const calendarId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedDate = parseCalendarDate(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const initial = selectedDate ?? parseCalendarDate(max) ?? parseCalendarDate(min) ?? new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1, 12);
  });

  useEffect(() => {
    if (!open) return;

    function closeCalendar(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", closeCalendar);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeCalendar);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1, 12);
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - mondayOffset);
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
  const todayValue = calendarDateValue(new Date());

  function changeMonth(offset: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1, 12));
  }

  function openCalendar() {
    if (disabled) return;
    const current = selectedDate ?? parseCalendarDate(max) ?? parseCalendarDate(min) ?? new Date();
    setVisibleMonth(new Date(current.getFullYear(), current.getMonth(), 1, 12));
    setOpen((currentOpen) => !currentOpen);
  }

  return (
    <div className="date-picker" ref={rootRef}>
      <button
        className="date-picker__trigger"
        type="button"
        onClick={openCalendar}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? calendarId : undefined}
      >
        <span className={value ? "" : "date-picker__placeholder"}>
          {selectedDate
            ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(selectedDate)
            : "yyyy-mm-dd"}
        </span>
        <CalendarDays size={15} aria-hidden="true" />
      </button>

      {open && (
        <div className="date-picker__popover" id={calendarId} role="dialog" aria-label={`${ariaLabel} calendar`}>
          <div className="date-picker__header">
            <strong>{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(visibleMonth)}</strong>
            <div>
              <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={17} /></button>
              <button type="button" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRight size={17} /></button>
            </div>
          </div>
          <div className="date-picker__weekdays" aria-hidden="true">
            {CALENDAR_WEEKDAYS.map((weekday) => <span key={weekday}>{weekday.slice(0, 1)}</span>)}
          </div>
          <div className="date-picker__grid" role="grid">
            {calendarDays.map((day) => {
              const dayValue = calendarDateValue(day);
              const outsideMonth = day.getMonth() !== visibleMonth.getMonth();
              const unavailable = Boolean((min && dayValue < min) || (max && dayValue > max));
              const selected = dayValue === value;
              return (
                <button
                  type="button"
                  role="gridcell"
                  key={dayValue}
                  className={`${outsideMonth ? "is-outside " : ""}${selected ? "is-selected" : ""}`}
                  disabled={unavailable}
                  aria-label={new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(day)}
                  aria-current={dayValue === todayValue ? "date" : undefined}
                  aria-selected={selected}
                  onClick={() => { onChange(dayValue); setOpen(false); }}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AddJourney({
  onSave,
  initialLeg,
  previousLeg,
  recentPlaces,
}: {
  onSave: (leg: JourneyLeg) => void;
  initialLeg?: JourneyLeg;
  previousLeg?: JourneyLeg | null;
  recentPlaces: Place[];
}) {
  const defaultMode = initialLeg?.mode ?? previousLeg?.mode ?? "rail";
  const [number, setNumber] = useState(initialLeg?.number ?? "");
  const [date, setDate] = useState(
    initialLeg?.travelDate ?? previousLeg?.travelDate ?? new Date().toISOString().slice(0, 10),
  );
  const [mode, setMode] = useState<TravelMode>(defaultMode);
  const [operator, setOperator] = useState(initialLeg?.operator ?? "");
  const [origin, setOrigin] = useState<Place | null>(
    initialLeg?.origin ?? (previousLeg?.destination.kind === defaultModeToKind(defaultMode)
      ? previousLeg.destination
      : null),
  );
  const [destination, setDestination] = useState<Place | null>(initialLeg?.destination ?? null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  function changeMode(nextMode: TravelMode) {
    setMode(nextMode);
    setOrigin(null);
    setDestination(null);
    setStatus("idle");
  }

  async function submitJourney(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");

    try {
      const response = await fetch("/api/legs/manual", {
        method: initialLeg ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: initialLeg?.id,
          createdAt: initialLeg?.createdAt,
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
      onSave(data.leg);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="panel-view panel-view--form">
      <div className="panel-view__header">
        <div>
          <h1>{initialLeg ? "Edit journey" : "Add a journey"}</h1>
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
            <DatePicker value={date} onChange={setDate} ariaLabel="Travel date" />
          </label>
        </div>

        <PlaceCombobox
          label="From"
          kind={mode === "rail" ? "station" : "airport"}
          value={origin}
          onChange={setOrigin}
          recentPlaces={recentPlaces.filter((place) => place.kind === defaultModeToKind(mode))}
          excludeId={destination?.id}
        />
        <PlaceCombobox
          label="To"
          kind={mode === "rail" ? "station" : "airport"}
          value={destination}
          onChange={setDestination}
          recentPlaces={recentPlaces.filter((place) => place.kind === defaultModeToKind(mode))}
          excludeId={origin?.id}
        />

        <OperatorCombobox mode={mode} value={operator} onChange={setOperator} />

        <button className="primary-action" disabled={status === "loading" || !origin || !destination}>
          {status === "loading"
            ? initialLeg ? "Saving changes…" : "Adding journey…"
            : initialLeg ? "Save changes" : "Add to passport"}
          {status !== "loading" && <ArrowRight size={17} />}
        </button>

        {status === "error" && <p className="form-error" role="alert">Choose two different places and try again.</p>}
      </form>

    </div>
  );
}

function defaultModeToKind(mode: TravelMode): Place["kind"] {
  return mode === "rail" ? "station" : "airport";
}

function OperatorMark({ leg }: { leg: JourneyLeg }) {
  const logoUrl = operatorLogoUrl(leg.mode, leg.operator, leg.number);
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small remote logo; next/image adds nothing here
      <img
        className="operator-mark"
        src={logoUrl}
        alt={leg.operator}
        title={leg.operator}
        width={44}
        height={44}
        loading="lazy"
        onError={(event) => { event.currentTarget.hidden = true; }}
      />
    );
  }

  const initials = operatorInitials(leg.operator);
  if (!initials || leg.operator === "Unknown operator") return null;
  return (
    <span
      className={`operator-mark operator-mark--monogram ${leg.mode === "air" ? "operator-mark--air" : ""}`}
      title={leg.operator}
      aria-label={leg.operator}
    >
      {initials}
    </span>
  );
}

function JourneyDetail({
  leg,
  onBack,
  onRemove,
  onEdit,
  onReverse,
}: {
  leg: JourneyLeg;
  onBack: () => void;
  onRemove: (id: string) => void;
  onEdit: () => void;
  onReverse: () => Promise<void>;
}) {
  const [reversing, setReversing] = useState(false);
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
          <div className="detail-title">
            <h1>{leg.number}: {leg.origin.city} → {leg.destination.city}</h1>
            <OperatorMark leg={leg} />
          </div>
        </div>
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
        <div>
          <span>Distance</span>
          <strong>{leg.mode === "rail" ? formatRailDistance(leg) : leg.distanceKm.toLocaleString("en-GB")} km</strong>
        </div>
        <div><span>Stops</span><strong>{stops.length}</strong></div>
        <div>
          <span>Time</span>
          <strong>
            {leg.mode === "rail"
              ? formatDuration(railLegDurationMinutes(leg))
              : `~${formatDuration(estimatedFlightMinutes(leg.distanceKm))}`}
          </strong>
        </div>
      </div>

      <section className="calling-points" aria-labelledby="calling-points-title">
        <div className="section-heading">
          <div><h2 id="calling-points-title">Route</h2></div>
          <span>{stops.length} stops</span>
        </div>
        <ol>
          {stops.map((stop, index) => (
            <li key={`${stop.place.id}-${stop.sequence}`}>
              {(stop.departure ?? stop.arrival) && <time>{formatTime(stop.departure ?? stop.arrival)}</time>}
              <span className="calling-points__track" aria-hidden="true"><i /></span>
              <div><strong>{stop.place.name}</strong><span>{stop.place.city}{stop.place.country && ` · ${stop.place.country}`}</span></div>
              {(index === 0 || index === stops.length - 1) && <small>{index === 0 ? "DEPART" : "ARRIVE"}</small>}
            </li>
          ))}
        </ol>
      </section>

      <div className="detail-actions">
        <button type="button" onClick={onEdit}><Pencil size={15} /> Edit</button>
        <button
          type="button"
          disabled={reversing}
          onClick={() => {
            setReversing(true);
            void onReverse().finally(() => setReversing(false));
          }}
        >
          <ArrowLeftRight size={15} /> {reversing ? "Adding…" : "Add return"}
        </button>
        <button className="danger-action" type="button" onClick={() => onRemove(leg.id)}><Trash2 size={15} /> Delete</button>
      </div>
    </div>
  );
}

function JourneyControls({
  mode,
  query,
  dateFrom,
  dateTo,
  dateBounds,
  onModeChange,
  onQueryChange,
  onDateFromChange,
  onDateToChange,
  onClearDates,
}: {
  mode: ModeFilter;
  query: string;
  dateFrom: string;
  dateTo: string;
  dateBounds: { min: string; max: string } | null;
  onModeChange: (mode: ModeFilter) => void;
  onQueryChange: (query: string) => void;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  onClearDates: () => void;
}) {
  return (
    <div className="journal-controls">
      <label className="journey-search">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Search My Journeys</span>
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search My Journeys" />
        {query && <button type="button" onClick={() => onQueryChange("")} aria-label="Clear search"><X size={14} /></button>}
      </label>
      <div className="mode-switch" aria-label="Filter journeys by mode">
        {["all", "rail", "air"].map((filterMode) => (
          <button
            type="button"
            key={filterMode}
            className={mode === filterMode ? "is-active" : ""}
            aria-pressed={mode === filterMode}
            onClick={() => onModeChange(filterMode as ModeFilter)}
          >
            {filterMode === "rail" && <TrainFront size={13} />}
            {filterMode === "air" && <Plane size={13} />}
            {filterMode === "all" ? "All" : filterMode === "rail" ? "Rail" : "Air"}
          </button>
        ))}
      </div>
      <div className="date-filter" aria-label="Filter journeys by travel date">
        <label>
          <span className="date-filter__label">From</span>
          <DatePicker value={dateFrom} min={dateBounds?.min} max={dateTo || dateBounds?.max} disabled={!dateBounds} onChange={onDateFromChange} ariaLabel="Filter from date" />
        </label>
        <label>
          <span className="date-filter__label">To</span>
          <DatePicker value={dateTo} min={dateFrom || dateBounds?.min} max={dateBounds?.max} disabled={!dateBounds} onChange={onDateToChange} ariaLabel="Filter to date" />
        </label>
        {(dateFrom || dateTo) && dateBounds && (
          <button type="button" onClick={onClearDates} aria-label="Clear date filter"><X size={14} /></button>
        )}
      </div>
    </div>
  );
}

function JourneyJournal({
  legs,
  stats,
  query,
  dateBounds,
  mode,
  dateFrom,
  dateTo,
  onModeChange,
  onQueryChange,
  onDateFromChange,
  onDateToChange,
  onClearDates,
  onSelect,
  onAdd,
  account,
}: {
  legs: JourneyLeg[];
  stats: TravelStats;
  query: string;
  dateBounds: { min: string; max: string } | null;
  mode: ModeFilter;
  dateFrom: string;
  dateTo: string;
  onModeChange: (mode: ModeFilter) => void;
  onQueryChange: (query: string) => void;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  onClearDates: () => void;
  onSelect: (leg: JourneyLeg) => void;
  onAdd: () => void;
  account: Account;
}) {
  const passport = mode === "rail"
    ? {
        title: "MY RAIL PASSPORT",
        countLabel: "Trains",
        count: stats.railJourneys,
        distanceLabel: "Train distance",
        distanceKm: stats.railDistanceKm,
        timeLabel: "Train time",
        placesLabel: "Stations",
        places: stats.railStations,
        operatorsLabel: "Operators",
        flagsLabel: "Countries reached by rail",
        countries: stats.railCountries,
      }
    : mode === "air"
      ? {
          title: "MY FLIGHT PASSPORT",
          countLabel: "Flights",
          count: stats.airJourneys,
          distanceLabel: "Flight distance",
          distanceKm: stats.airDistanceKm,
          timeLabel: "Flight time",
          placesLabel: "Airports",
          places: stats.places,
          operatorsLabel: "Airlines",
          flagsLabel: "Countries reached by air",
          countries: stats.airCountries,
        }
      : {
          title: "MY PASSPORT",
          countLabel: "Journeys",
          count: stats.journeys,
          distanceLabel: "Distance",
          distanceKm: stats.railDistanceKm + stats.airDistanceKm,
          timeLabel: "Travel time",
          placesLabel: "Places",
          places: stats.places,
          operatorsLabel: "Operators",
          flagsLabel: "Countries visited",
          countries: stats.visitedCountries,
        };

  return (
    <div className="panel-view panel-view--journal">
      <section className="passport-summary">
        <div className="passport-summary__title">
          <div>
            <h1>{passport.title}</h1>
            <span className="passport-summary__subtitle">PASSPORT · PASS · PASAPORTE</span>
          </div>
          <AccountChip account={account} />
        </div>
        <div className="passport-stats" aria-label="Travel summary">
          <div className="passport-stat">
            <span>{passport.countLabel}</span>
            <strong>{passport.count.toLocaleString("en-GB")}</strong>
          </div>
          <div className="passport-stat passport-stat--distance">
            <span>{passport.distanceLabel}</span>
            <strong>{Math.round(passport.distanceKm).toLocaleString("en-GB")}<small>km</small></strong>
          </div>
          <div className="passport-stat">
            <span>{passport.timeLabel}</span>
            <strong>
              {(() => {
                const minutes = mode === "rail"
                  ? stats.railDurationMinutes
                  : mode === "air"
                    ? stats.airDurationMinutes
                    : stats.railDurationMinutes + stats.airDurationMinutes;
                const estimated = mode !== "rail" && stats.airDurationMinutes > 0;
                return minutes > 0 ? `${estimated ? "~" : ""}${formatDuration(minutes)}` : "—";
              })()}
            </strong>
          </div>
          <div className="passport-stat-pair">
            <div><span>{passport.placesLabel}</span><strong>{passport.places.toLocaleString("en-GB")}</strong></div>
            <div><span>{passport.operatorsLabel}</span><strong>{stats.operators.toLocaleString("en-GB")}</strong></div>
          </div>
        </div>
        <div className="passport-dates" aria-label="Travel date summary">
          <div><span>First trip</span><strong>{stats.firstTripDate ? formatDate(stats.firstTripDate) : "—"}</strong></div>
          <div>
            <span>Busiest month</span><strong>{stats.busiestMonth
              ? formatMonth(stats.busiestMonth.month)
              : "—"}</strong>
          </div>
          <div><span>Latest trip</span><strong>{stats.lastTripDate ? formatDate(stats.lastTripDate) : "—"}</strong></div>
        </div>
        {passport.countries.length > 0 && (
          <div className="passport-flags" aria-label={passport.flagsLabel}>
            {passport.countries.map((country) => (
              // eslint-disable-next-line @next/next/no-img-element -- tiny remote SVG flag icons; next/image adds nothing here
              <img
                key={country}
                src={`https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@2.7.0/flags/${country.toLowerCase()}.svg`}
                alt={countryName(country)}
                title={countryName(country)}
                width={26}
                height={26}
                loading="lazy"
              />
            ))}
          </div>
        )}
      </section>

      <JourneyControls
        mode={mode}
        query={query}
        dateFrom={dateFrom}
        dateTo={dateTo}
        dateBounds={dateBounds}
        onModeChange={onModeChange}
        onQueryChange={onQueryChange}
        onDateFromChange={onDateFromChange}
        onDateToChange={onDateToChange}
        onClearDates={onClearDates}
      />

      <section className="journey-board" aria-labelledby="journeys-title">
        <div className="section-heading section-heading--board">
          <div><h2 id="journeys-title">Recent journeys</h2></div>
        </div>

        {legs.length === 0 ? (
          <div className="journal-empty">
            <strong>No journeys here</strong>
            <p>{query || dateBounds ? "Try different filters." : "Add a journey to draw your first line."}</p>
            {!query && !dateBounds && <button type="button" onClick={onAdd}>Add journey</button>}
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
                <span className="journey-row__meta">
                  <time>{formatDate(leg.travelDate)}</time>
                </span>
                <ChevronRight className="journey-row__chevron" size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function TravelDashboard({
  initialLegs,
  persistence,
  account = null,
}: {
  initialLegs: JourneyLeg[];
  persistence: PersistenceMode;
  account?: Account;
}) {
  const [legs, setLegs] = useState(initialLegs);
  const [mode, setMode] = useState<ModeFilter>("all");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [panelView, setPanelView] = useState<PanelView>("journal");
  const [selectedLegId, setSelectedLegId] = useState<string | null>(null);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [journeyDialogOpen, setJourneyDialogOpen] = useState(false);
  const [railPathStyle, setRailPathStyle] = useState<RailPathStyle>("actual");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PATH_STYLE_STORAGE_KEY);
      if (saved === "straight" || saved === "actual") queueMicrotask(() => setRailPathStyle(saved));
    } catch { /* The default route style still works. */ }
  }, []);

  function changeRailPathStyle(style: RailPathStyle) {
    setRailPathStyle(style);
    try { window.localStorage.setItem(PATH_STYLE_STORAGE_KEY, style); } catch { /* In-memory state still works. */ }
  }

  const [mapView, setMapView] = useState<MapView>("map");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MAP_VIEW_STORAGE_KEY);
      if (saved === "map" || saved === "planet") queueMicrotask(() => setMapView(saved));
    } catch { /* The flat map still works. */ }
  }, []);

  function changeMapView(view: MapView) {
    setMapView(view);
    try { window.localStorage.setItem(MAP_VIEW_STORAGE_KEY, view); } catch { /* In-memory state still works. */ }
  }

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
        })
        .catch(() => {
          setLegs(validLegs);
        });
    } catch {
      // Ignore unavailable or malformed browser storage.
    }
  }, [initialLegs.length, persistence]);

  useEffect(() => {
    if (!journeyDialogOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setJourneyDialogOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [journeyDialogOpen]);

  const routeRefreshStartedRef = useRef(false);
  const routeRefreshCancelledRef = useRef(false);
  useEffect(() => {
    routeRefreshCancelledRef.current = false;
    return () => { routeRefreshCancelledRef.current = true; };
  }, []);
  useEffect(() => {
    if (routeRefreshStartedRef.current || legs.length === 0) return;
    routeRefreshStartedRef.current = true;

    let attempted: Set<string>;
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(ROUTE_REFRESH_STORAGE_KEY) ?? "[]") as unknown;
      attempted = new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : []);
    } catch {
      attempted = new Set();
    }

    const staleLegs = legs.filter((leg) => needsRouteRefresh(leg) && !attempted.has(leg.id));
    if (staleLegs.length === 0) return;

    void (async () => {
      for (const leg of staleLegs) {
        if (routeRefreshCancelledRef.current) return;
        attempted.add(leg.id);
        try {
          window.sessionStorage.setItem(ROUTE_REFRESH_STORAGE_KEY, JSON.stringify([...attempted]));
        } catch { /* Refreshing still works; it just repeats next load. */ }

        try {
          const response = await fetch("/api/legs/manual", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: leg.id,
              createdAt: leg.createdAt,
              mode: leg.mode,
              number: leg.number,
              travelDate: leg.travelDate,
              operator: leg.operator,
              origin: leg.origin,
              destination: leg.destination,
            }),
          });
          const data = (await response.json()) as { leg?: JourneyLeg };
          if (routeRefreshCancelledRef.current || !response.ok || !data.leg || !isJourneyLeg(data.leg)) continue;
          const refreshed = data.leg;
          setLegs((current) => {
            const nextLegs = current.map((item) => item.id === refreshed.id ? refreshed : item);
            saveLegs(nextLegs);
            return nextLegs;
          });
        } catch { /* The existing leg keeps its straight line. */ }
      }
    })();
  }, [legs]);

  const stats: TravelStats = useMemo(
    () => calculateJourneyStats(mode === "all" ? legs : legs.filter((leg) => leg.mode === mode)),
    [legs, mode],
  );
  const dateBounds = useMemo(() => {
    const dates = legs.map((leg) => leg.travelDate).sort((first, second) => first.localeCompare(second));
    return dates.length ? { min: dates[0], max: dates.at(-1) as string } : null;
  }, [legs]);
  const effectiveDateFrom = dateFrom || dateBounds?.min || "";
  const effectiveDateTo = dateTo || dateBounds?.max || "";
  const visibleLegs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return [...legs]
      .filter((leg) => mode === "all" || leg.mode === mode)
      .filter((leg) =>
        (!effectiveDateFrom || leg.travelDate >= effectiveDateFrom) &&
        (!effectiveDateTo || leg.travelDate <= effectiveDateTo),
      )
      .filter((leg) => {
        if (!normalizedQuery) return true;
        return [leg.number, leg.operator, leg.origin.name, leg.origin.city, leg.destination.name, leg.destination.city]
          .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => b.travelDate.localeCompare(a.travelDate));
  }, [effectiveDateFrom, effectiveDateTo, legs, mode, query]);
  const mapLegs = useMemo(() => legs.filter((leg) =>
    (mode === "all" || leg.mode === mode) &&
    (!effectiveDateFrom || leg.travelDate >= effectiveDateFrom) &&
    (!effectiveDateTo || leg.travelDate <= effectiveDateTo),
  ), [effectiveDateFrom, effectiveDateTo, legs, mode]);
  const selectedLeg = legs.find((leg) => leg.id === selectedLegId) ?? null;
  const latestLeg = useMemo(() => [...legs].sort((first, second) =>
    second.travelDate.localeCompare(first.travelDate) ||
    second.createdAt.localeCompare(first.createdAt),
  )[0] ?? null, [legs]);
  const recentPlaces = useMemo(() => {
    const uniquePlaces = new Map<string, Place>();
    const recentLegs = [...legs].sort((first, second) =>
      second.travelDate.localeCompare(first.travelDate) ||
      second.createdAt.localeCompare(first.createdAt),
    );

    for (const leg of recentLegs) {
      for (const place of [leg.destination, leg.origin]) {
        if (!uniquePlaces.has(place.id)) uniquePlaces.set(place.id, place);
        if (uniquePlaces.size >= 10) return Array.from(uniquePlaces.values());
      }
    }
    return Array.from(uniquePlaces.values());
  }, [legs]);

  function saveLegs(nextLegs: JourneyLeg[]) {
    try { window.localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(nextLegs)); } catch { /* In-memory state still works. */ }
  }

  function showJournal() {
    setPanelView("journal");
    setSelectedLegId(null);
    setJourneyDialogOpen(false);
  }

  function selectLeg(leg: JourneyLeg) {
    setSelectedLegId(leg.id);
    setPanelView("detail");
    setJourneyDialogOpen(true);
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

  function updateLeg(leg: JourneyLeg) {
    setLegs((current) => {
      const nextLegs = current.map((item) => item.id === leg.id ? leg : item);
      saveLegs(nextLegs);
      return nextLegs;
    });
    setSelectedLegId(leg.id);
    setPanelView("detail");
  }

  async function reverseLeg(leg: JourneyLeg) {
    const response = await fetch("/api/legs/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: leg.mode,
        number: leg.number,
        travelDate: leg.travelDate,
        operator: leg.operator,
        origin: leg.destination,
        destination: leg.origin,
      }),
    });
    const data = (await response.json()) as { leg?: JourneyLeg; error?: string };
    if (!response.ok || !data.leg || !isJourneyLeg(data.leg)) {
      throw new Error(data.error || "Could not add the return journey.");
    }
    addLeg(data.leg);
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
      }
    }
  }

  return (
    <main className={`map-workspace ${leftSidebarOpen ? "has-sidebar" : "is-map-only"}`}>
      <div className="map-canvas" aria-label="Journey map">
        <MapShell legs={mapLegs} selectedLegId={selectedLegId} sidebarOpen={leftSidebarOpen} railPathStyle={railPathStyle} view={mapView} onSelectLeg={(id) => {
          const leg = legs.find((candidate) => candidate.id === id);
          if (leg) selectLeg(leg);
        }} />

        {!leftSidebarOpen && (
          <button className="show-sidebar show-sidebar--left" type="button" onClick={() => setLeftSidebarOpen(true)}>
            <span>Open journeys</span>
          </button>
        )}

        {!journeyDialogOpen && (
          <button
            className="show-sidebar show-sidebar--right"
            type="button"
            onClick={() => { setPanelView("add"); setJourneyDialogOpen(true); }}
            aria-label="Add journey"
            title="Add journey"
          >
            <Plus size={24} strokeWidth={2.25} aria-hidden="true" />
          </button>
        )}

        <div className="map-controls">
          <div className="map-status" aria-live="polite">
            <span><i className="map-status__rail" /> {mode === "air" ? 0 : mapLegs.filter((leg) => leg.mode === "rail").length} rail</span>
            <span><i className="map-status__air" /> {mode === "rail" ? 0 : mapLegs.filter((leg) => leg.mode === "air").length} air</span>
          </div>

          <div className="map-path-toggle" role="group" aria-label="Rail route style">
            <button
              type="button"
              className={railPathStyle === "straight" ? "is-active" : ""}
              aria-pressed={railPathStyle === "straight"}
              onClick={() => changeRailPathStyle("straight")}
            >
              <MoveUpRight size={12} /> Straight
            </button>
            <button
              type="button"
              className={railPathStyle === "actual" ? "is-active" : ""}
              aria-pressed={railPathStyle === "actual"}
              onClick={() => changeRailPathStyle("actual")}
            >
              <Spline size={12} /> Tracks
            </button>
          </div>

          <div className="map-path-toggle map-view-toggle" role="group" aria-label="Map view">
            <button
              type="button"
              className={mapView === "map" ? "is-active" : ""}
              aria-pressed={mapView === "map"}
              onClick={() => changeMapView("map")}
            >
              <MapIcon size={12} /> Map
            </button>
            <button
              type="button"
              className={mapView === "planet" ? "is-active" : ""}
              aria-pressed={mapView === "planet"}
              onClick={() => changeMapView("planet")}
            >
              <Globe size={12} /> Planet
            </button>
          </div>
        </div>

      </div>

      <aside className={`journey-sidebar ${leftSidebarOpen ? "" : "journey-sidebar--closed-left"}`} aria-label="Journey information" aria-hidden={!leftSidebarOpen}>
        <button className="icon-button sidebar-close" type="button" onClick={() => setLeftSidebarOpen(false)} aria-label="Hide left journey panel"><PanelLeftClose size={18} /></button>
        <div className="sidebar-scroll">
          <JourneyJournal
            legs={visibleLegs}
            stats={stats}
            query={query}
            dateBounds={dateBounds}
            mode={mode}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onModeChange={(nextMode) => { setMode(nextMode); setSelectedLegId(null); }}
            onQueryChange={setQuery}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onClearDates={() => { setDateFrom(""); setDateTo(""); setSelectedLegId(null); }}
            account={account}
            onSelect={selectLeg}
            onAdd={() => { setPanelView("add"); setJourneyDialogOpen(true); }}
          />
        </div>

      </aside>

      {journeyDialogOpen && (
        <div
          className="journey-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setJourneyDialogOpen(false);
          }}
        >
          <section className="journey-dialog" role="dialog" aria-modal="true" aria-label="Journey">
            <button className="icon-button journey-dialog__close" type="button" onClick={() => setJourneyDialogOpen(false)} aria-label="Close journey dialog">
              <X size={20} />
            </button>
            <div className="sidebar-scroll">
              {panelView === "edit" && selectedLeg ? (
                <AddJourney
                  onSave={updateLeg}
                  initialLeg={selectedLeg}
                  recentPlaces={recentPlaces}
                />
              ) : panelView === "detail" && selectedLeg ? (
                <JourneyDetail
                  leg={selectedLeg}
                  onBack={showJournal}
                  onRemove={removeLeg}
                  onEdit={() => setPanelView("edit")}
                  onReverse={() => reverseLeg(selectedLeg)}
                />
              ) : (
                <AddJourney
                  onSave={addLeg}
                  previousLeg={latestLeg}
                  recentPlaces={recentPlaces}
                />
              )}
            </div>
          </section>
        </div>
      )}

      <div className="mobile-map-label" aria-hidden="true"><MapIcon size={14} /> Map</div>
    </main>
  );
}
