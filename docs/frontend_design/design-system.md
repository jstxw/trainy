# Design system — rail travel log

A concrete system derived from European rail signage: split-flap boards for the shell, the yellow departure poster for detail views, Frutiger-lineage type throughout.

These are **your** tokens, designed for this app. They are not Flighty's values — those aren't public, and anything online claiming to be them is a reconstruction from screenshots.

---

## Typography

Two families, both free, both on Google Fonts.

**Inter** for interface text. Designed for screen legibility at small sizes, same brief Frutiger was drawn for. Closest free relative of SF Pro.

**IBM Plex Mono** for train numbers, times, station codes and distances. Slightly mechanical, which is exactly right — split-flap boards were monospaced because the hardware forced it, and that constraint became the visual signature.

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

:root {
  --font-ui:   'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
}

/* Non-negotiable. Apply globally. */
html {
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}
```

### Scale

Fewer sizes than you think you need. Six is enough.

```css
:root {
  --text-xs:   0.75rem;   /* 12px — labels, units, metadata */
  --text-sm:   0.875rem;  /* 14px — secondary lines, intermediate stops */
  --text-base: 1rem;      /* 16px — body */
  --text-lg:   1.25rem;   /* 20px — station names in cards */
  --text-xl:   1.75rem;   /* 28px — section stats */
  --text-2xl:  3rem;      /* 48px — passport headline figures */
}
```

**Letter-spacing matters at the extremes.** Signage tightens large type and opens up small caps labels:

```css
.stat-figure { font-size: var(--text-2xl); letter-spacing: -0.02em; font-weight: 700; }
.label       { font-size: var(--text-xs);  letter-spacing: 0.08em; text-transform: uppercase; font-weight: 500; }
```

---

## Colour

Dark shell, for two reasons: split-flap boards are dark, and a dark UI is what a map wants behind it. Your route lines become the only saturated thing on screen.

```css
:root {
  /* Surfaces — near-black, slightly warm, never pure #000 */
  --bg-base:    #0B0D0F;   /* page */
  --bg-raised:  #14171A;   /* cards, panels */
  --bg-overlay: #1C2024;   /* popovers, hover */
  --border:     #262B30;

  /* Text — warm off-white, like split-flap characters */
  --fg-primary:   #F2F0EC;
  --fg-secondary: #9BA1A8;
  --fg-muted:     #5F666D;

  /* Modes — these are your data colours */
  --rail: #2FBF71;   /* green */
  --air:  #E8973A;   /* amber */

  /* Status — departure board convention */
  --status-ok:    #2FBF71;
  --status-warn:  #E8B33A;
  --status-alert: #E0524A;

  /* Accent — the departure poster yellow, used sparingly */
  --accent: #F5C518;
}
```

**Discipline note.** Rail green and air amber are your only saturated colours. Everything else is greyscale. The moment a third hue appears in the chrome, the map stops reading as the focus.

Use `--accent` for at most one thing per screen — the primary action, or the current selection. It's a poster yellow; it dominates instantly.

---

## Layout

```css
:root {
  --space-1: 0.25rem;  --space-2: 0.5rem;   --space-3: 0.75rem;
  --space-4: 1rem;     --space-6: 1.5rem;   --space-8: 2rem;
  --space-12: 3rem;

  --radius-sm: 4px;
  --radius:    8px;
  --radius-lg: 12px;
}
```

Keep radii small. Signage is rectilinear; heavily rounded cards read as consumer-app-generic and fight the reference.

---

## Components

### Journey row — the departure board line

The core component. One line per journey, exactly as a board gives one line per train.

```
┌────────────────────────────────────────────────────────────────┐
│ EC 317   Stuttgart Hbf ──────→ Milano Centrale    14 JUL  412km │
└────────────────────────────────────────────────────────────────┘
  mono      ui, lg                 ui, lg            mono   mono
  accent    fg-primary             fg-primary        muted  muted
```

Rules:

- Train number in mono, left, fixed width so numbers align down the column
- A 2px mode-coloured bar on the left edge — green rail, amber air — carrying the mode with no legend or icon
- Station names get the visual weight; they're what you scan for
- Date and distance right-aligned in mono, secondary colour
- Entire row is the expand target
- Row height fixed. Boards have consistent line height and it's most of why they scan well

```css
.journey-row {
  display: grid;
  grid-template-columns: 5rem 1fr auto;
  gap: var(--space-4);
  align-items: center;
  height: 3.5rem;
  padding: 0 var(--space-4);
  border-left: 2px solid var(--rail);
  background: var(--bg-raised);
  font-variant-numeric: tabular-nums;
}
.journey-row[data-mode="air"] { border-left-color: var(--air); }
.journey-row:hover { background: var(--bg-overlay); }

.journey-row .number { font-family: var(--font-mono); color: var(--accent); }
.journey-row .route  { font-size: var(--text-lg); color: var(--fg-primary); }
.journey-row .meta   { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--fg-muted); }
```

### Journey detail — the departure poster

Expanded view, modelled on the yellow poster rather than a generic modal.

Time left, route centre, intermediate stops small and grey beneath the main route, metadata right. When you have GTFS geometry, intermediate stops go here as a vertical list with times — which is precisely what the poster does.

```
14:22   Stuttgart Hbf                          EC 317
        Ulm · Augsburg · München · Kufstein     ÖBB
        Innsbruck · Bozen · Trento · Verona
21:05   Milano Centrale                        412 km
```

### Stat block

Figure large, label small-caps above it. Never the reverse — the number is what's being communicated.

```html
<div class="stat">
  <span class="label">Stations visited</span>
  <span class="figure">147</span>
</div>
```

```css
.stat .label  { display:block; font-size:var(--text-xs); letter-spacing:.08em;
                text-transform:uppercase; color:var(--fg-muted); }
.stat .figure { display:block; font-size:var(--text-2xl); font-weight:700;
                letter-spacing:-.02em; color:var(--fg-primary);
                font-variant-numeric: tabular-nums; }
```

### Search input

Full-width, mono placeholder showing the expected shape rather than an instruction:

```
┌────────────────────────────────────────┐
│ Stuttgart Hbf                          │
└────────────────────────────────────────┘
```

Results show name, then country and UIC in mono grey. Boost UIC-bearing entries so real stations outrank bus stops.

---

## Map styling

The map is the product; the interface is a frame around it.

**Basemap:** request a Positron-style style from OpenFreeMap or Protomaps — desaturated grey, thin labels, built as a data backdrop. Then darken it to match the shell.

**Rail:** `--rail`, 2px, full opacity, flat MapLibre line layers.

**Air:** `--air`, 1.5px, deck.gl `ArcLayer` with `greatCircle: true` and `getHeight` well below default. At European distances the default arcs absurdly high.

**Stations:** circles scaled by visit count, `--fg-primary` at low opacity with a solid 1px stroke. Radius by square root of visits, not linear — linear makes frequent stations swallow the map.

**Never** let the basemap carry saturated colour. If roads are visible in orange, your routes stop reading as data.

---

## Motion

Sparingly, and only functionally.

```css
:root {
  --ease: cubic-bezier(0.32, 0.72, 0, 1);
  --duration-fast: 120ms;
  --duration:      200ms;
}
```

Hover and expand transitions at `--duration-fast`. Map fly-to at 600ms. Nothing else animates.

The one animation worth building: **playing the journal in date order**, legs drawing onto the map chronologically. It's the single most impressive thing this data supports, and it needs `travel_date` on the model — which is on your fix list.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
```

---

## Checklist

- [ ] `font-variant-numeric: tabular-nums` set globally
- [ ] Mono for every number, code and time; Inter for everything else
- [ ] Exactly two saturated hues in the UI: rail green, air amber
- [ ] Accent yellow used once per screen at most
- [ ] Journey rows fixed height, mode carried by the left edge bar
- [ ] Basemap desaturated so routes are the only colour on the map
- [ ] Station radius scaled by √visits
- [ ] Reduced-motion respected
- [ ] Focus rings visible — dark UIs hide them by default
