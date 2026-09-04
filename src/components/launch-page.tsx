"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { MapShell } from "@/components/map-shell";
import { SignInDialog } from "@/components/sign-in-dialog";
import { LAUNCH_SAMPLE_LEGS, LAUNCH_STATS } from "@/lib/launch-samples";

const numberFormat = new Intl.NumberFormat("en-GB");

export type LaunchSignIn = {
  configured: boolean;
  initiallyOpen: boolean;
  initialError?: string;
};

/**
 * One viewport, no scrolling. The live map with sample routes is the hero;
 * the copy travels on a boarding-pass ticket whose stub carries the actions.
 * Sign-in opens as a dialog over this same page. The URL flips between / and
 * /login through the native history API so the maps never remount.
 */
export function LaunchPage({ signIn }: { signIn: LaunchSignIn }) {
  const [signInOpen, setSignInOpen] = useState(signIn.initiallyOpen);

  const openSignIn = useCallback(() => {
    setSignInOpen(true);
    if (window.location.pathname !== "/login") window.history.pushState(null, "", "/login");
  }, []);

  const closeSignIn = useCallback(() => {
    setSignInOpen(false);
    if (window.location.pathname === "/login") window.history.pushState(null, "", "/");
  }, []);

  useEffect(() => {
    const syncWithUrl = () => setSignInOpen(window.location.pathname === "/login");
    window.addEventListener("popstate", syncWithUrl);
    return () => window.removeEventListener("popstate", syncWithUrl);
  }, []);

  return (
    <main className="launch">
      {/* Flat map on the left, behind the ticket; the planet owns the right half. */}
      <div className="launch__map launch__map--flat" aria-hidden="true">
        <MapShell legs={LAUNCH_SAMPLE_LEGS} sidebarOpen={false} railPathStyle="straight" />
      </div>
      <div className="launch__map launch__map--planet" aria-hidden="true">
        <MapShell legs={LAUNCH_SAMPLE_LEGS} sidebarOpen={false} railPathStyle="straight" view="planet" continuousRotation />
      </div>

      <section className="ticket" aria-labelledby="launch-title" aria-hidden={signInOpen || undefined}>
        <div className="ticket__body">
          <header className="ticket__head">
            <span className="ticket__brand">
              <BrandMark />
              <span className="ticket__wordmark">Trainy</span>
            </span>
            <span className="ticket__stamp">EUROPEAN RAIL + AIR PASSPORT</span>
          </header>

          <h1 id="launch-title">
            Every European train and flight you take, drawn on one map.
          </h1>
          <p className="ticket__lead">
            Log a journey in seconds. Trainy traces routes across Europe, counts
            the countries, and keeps a passport of where you have been.
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
          {/* A real link so it works before hydration; once hydrated it opens the dialog in place. */}
          <Link
            href="/login"
            className="ticket__primary"
            onClick={(event) => { event.preventDefault(); openSignIn(); }}
          >
            Sign in
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/app" className="ticket__secondary">
            Open the map without an account
          </Link>
        </div>
      </section>

      {signInOpen && (
        <SignInDialog
          configured={signIn.configured}
          initialError={signIn.initialError}
          onClose={closeSignIn}
        />
      )}
    </main>
  );
}
