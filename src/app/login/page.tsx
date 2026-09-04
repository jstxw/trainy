import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { MapShell } from "@/components/map-shell";
import { LoginForm } from "@/app/login/login-form";
import { LAUNCH_SAMPLE_LEGS } from "@/lib/launch-samples";
import { isSupabaseConfigured } from "@/lib/supabase-env";

export const metadata: Metadata = {
  title: "Sign in — Trainy",
};

const ERROR_COPY: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Request a new one.",
  google: "Google sign-in could not start. Try again or use an email link.",
  unconfigured: "Sign-in is not configured on this deployment.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const errorKey = Array.isArray(error) ? error[0] : error;
  const configured = isSupabaseConfigured();

  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-card" aria-labelledby="login-title">
          <Link href="/" className="login-back"><ArrowLeft size={15} aria-hidden="true" /> Back to Trainy</Link>
          <div className="login-card__brand">
            <span className="login-card__wordmark"><BrandMark /><strong>Trainy</strong></span>
            <span className="login-card__stamp">EUROPEAN TRAVEL PASSPORT</span>
          </div>
          <h1 id="login-title">Welcome back</h1>
          <p className="login-card__lead">
            Sign in to continue mapping your European rail and air journeys.
          </p>

          {configured ? (
            <LoginForm initialError={errorKey ? ERROR_COPY[errorKey] : undefined} />
          ) : (
            <p className="login-error" role="status">{ERROR_COPY.unconfigured}</p>
          )}

          <p className="login-card__guest">
            Prefer not to sign in? <Link href="/app">Open the European map without an account</Link>.
          </p>
        </section>

        <section className="login-visual" aria-label="A rotating 3D map of European journeys">
          <MapShell legs={LAUNCH_SAMPLE_LEGS} sidebarOpen={false} railPathStyle="straight" view="planet" continuousRotation />
          <div className="login-visual__copy">
            <span>EUROPE IN MOTION</span>
            <strong>Your trains and flights, together on one living map.</strong>
          </div>
        </section>
      </div>
    </main>
  );
}
