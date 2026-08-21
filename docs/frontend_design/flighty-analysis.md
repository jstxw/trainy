# Flighty: what to take and what to leave

## The headline

Flighty's design is not original, and that is the point.

Ryan Jones's stated guiding principle is airport departure boards: one line per flight, because those boards have had fifty years of figuring out what matters to a stressed person scanning quickly. Live Activities and the Dynamic Island were explicitly designed to recall airport signage conventions.

So the instruction "replicate Flighty's UI" resolves into something better: **apply the same method to your domain.** Flighty borrowed aviation's signage language. You should borrow rail's — which is older, more rigorous, and more visually distinctive.

Copying Flighty directly would be copying a translation instead of going to the source.

---

## What's verifiable vs. what's reconstruction

Worth stating plainly: Flighty's actual design tokens are not public. Third-party analyses that list hex values and font stacks are the author's reconstruction from screenshots, not Flighty's real system. Treat any specific `#10B981` you find online as somebody's guess.

What *is* sourced:

- Airport departure boards as the explicit design analogy (Jones, in Apple's Behind the Design)
- "We want Flighty to work so well that it feels almost boringly obvious" (Jones)
- Apple Design Award 2023 for Interaction
- The Passport — the automatically-generated flight log — is, by Jones's own account, a top-three organic growth driver

That last one matters most for you. **The retrospective log is the product**, not a side feature. Flighty's most shareable artifact is the same thing you set out to build in your first message.

---

## What does not transfer

Roughly half of Flighty's craft is iOS-native and unavailable to you. Don't chase it.

**Live Activities, Dynamic Island, lock screen widgets.** No web equivalent. Skip entirely.

**Haptics and spring physics.** iOS gives these for free; on web they're a fight, and a bad imitation is worse than none.

**SF Pro.** Apple's system font, not licensable for web. Inter is the closest free equivalent and was designed for the same job.

**The 15 smart states.** This is Flighty's signature feature — context-aware states from "24 hours before" through "boarding" to "landed." It is entirely about *live* tracking. You explicitly chose retrospective logging. Building a state machine for journeys that already happened would be architecture cosplay.

**The connection assistant, gate maps, delay prediction.** All live-tracking features. Not your product.

---

## What transfers directly

### 1. One line per journey

The departure board's core structure. A row carries: identifier, destination, time, status. Nothing else. Everything additional lives behind a tap.

For you: `EC 317 · Stuttgart → Milano Centrale · 14 Jul · 412 km`. One line. Details on expand.

### 2. Pack, wrap and colour the data

Present conclusions, not raw values. A traveller shouldn't have to compute anything. Status is colour-coded so it reads pre-attentively — you know before you read.

For you, this is mostly about the stats panel. Not "17 legs, 4,203 km"; rather "Your busiest station was München Hbf, 8 times." The second is an insight; the first is a readout.

### 3. Progressive disclosure

Most important information above the fold. Everything else one level down. Flighty's cards show four or five facts; tapping reveals dozens.

Your journey list should show one line. The expanded view can carry every intermediate stop, the operator, the geometry, the notes.

### 4. Tabular figures everywhere

Departure boards align numerals in columns so the eye can scan vertically. On the web this is one CSS property and almost nobody uses it:

```css
font-variant-numeric: tabular-nums;
```

Apply to every time, distance, count and train number. It is the single highest-ratio change you can make — near-zero effort, and it's most of what makes numeric UI look professionally set.

### 5. The Passport as the destination

Flighty's log is deliberately beautiful and deliberately shareable. It's rendered as an artifact, not a table.

Yours is the map plus the year-in-review stats. Treat it as the product's centrepiece — the thing someone opens in December — rather than as a report generated from the data.

---

## Going to the source instead: rail signage

Aviation's signage tradition is about fifty years old. Rail's is over a century, and it's more designed.

**The departure poster.** Yellow for departures, white for arrivals — standardised across Germany, Austria, Switzerland, Italy and beyond. Time in the left column, destination bold, intermediate stops small and grey beneath, train number and platform right-aligned. This layout is the single best template for your journey detail view; it already solves "primary route plus intermediate stops" better than anything you'd invent.

**Split-flap boards.** Solari di Udine, 1950s. Warm off-white or amber characters on near-black, monospaced by mechanical necessity. This is where a dark UI with monospaced numerals gets its authenticity — and conveniently, a dark interface is also what a map wants behind it.

**Frutiger.** Adrian Frutiger designed it for Charles de Gaulle's signage: maximum legibility at distance and at an angle. It became the default voice of European transport wayfinding. Inter is a reasonable free stand-in and shares the design goals.

**The SBB clock.** Hans Hilfiker, 1944. Worth studying as an object lesson in how far reduction can go while remaining warm rather than cold.

**Diagram maps.** Beck's Tube map, Vignelli's NYC subway. Relevant if you ever build the network-graph view you mentioned alongside the geographic map.

Take the yellow departure poster for detail views, split-flap darkness for the shell, and Frutiger-lineage type throughout. That's a coherent visual identity that is recognisably *rail* rather than recognisably *Flighty*.

---

## The one Flighty principle worth writing on the wall

> "We want Flighty to work so well that it feels almost boringly obvious."

Applied to your build, that is a statement about entry friction more than aesthetics. If logging a journey takes a minute, you'll log the interesting ones and skip the routine ones, and your map will have holes exactly where your everyday travel was.

Boringly obvious means: sticky dates, a reverse button, recent places surfaced first, keyboard-only entry. None of that is visual design, and all of it determines whether the beautiful map has anything on it.
