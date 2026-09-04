import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { MapShell } from "@/components/map-shell";
import { LAUNCH_SAMPLE_LEGS, LAUNCH_STATS } from "@/lib/launch-samples";

const numberFormat = new Intl.NumberFormat("en-GB");

/**
 * One viewport, no scrolling. The live map with sample routes is the hero;
 * the copy travels on a boarding-pass ticket whose stub carries the actions.
 */
export function LaunchPage() {
  return (
    <main className="launch">
      <div className="launch__map" aria-hidden="true">
        <MapShell legs={LAUNCH_SAMPLE_LEGS} sidebarOpen railPathStyle="straight" />
      </div>

      <section className="ticket" aria-labelledby="launch-title">
        <div className="ticket__body">
          <header className="ticket__head">
            <span className="ticket__brand">
              <BrandMark />
              <span className="ticket__wordmark">Trainy</span>
            </span>
            <span className="ticket__stamp">BOARDING PASS · CARTE D&rsquo;EMBARQUEMENT</span>
          </header>

          <h1 id="launch-title">
            Every train and flight you take, drawn on one map.
          </h1>
          <p className="ticket__lead">
            Log a journey in seconds. Trainy traces the real tracks, counts the
            countries, and keeps a passport of where you have been.
          </p>

          <dl className="ticket__fields">
            <div>
              <dt>Stations</dt>
              <dd>{numberFormat.format(LAUNCH_STATS.stations)}</dd>
            </div>
            <div>
              <dt>Airports</dt>
              <dd>{numberFormat.format(LAUNCH_STATS.airports)}</dd>
            </div>
            <div>
              <dt>Countries</dt>
              <dd>{LAUNCH_STATS.countries}</dd>
            </div>
          </dl>
        </div>

        <div className="ticket__stub">
          <Link href="/login" className="ticket__primary">
            Sign in
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/app" className="ticket__secondary">
            Open the map without an account
          </Link>
          <p className="ticket__note">Journeys stay in this browser until you sign in.</p>
        </div>
      </section>
    </main>
  );
}
