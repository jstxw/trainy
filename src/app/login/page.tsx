import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/app/login/login-form";
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
      <section className="login-card" aria-labelledby="login-title">
        <Link href="/" className="login-back"><ArrowLeft size={15} aria-hidden="true" /> Trainy</Link>
        <div className="login-card__brand">
          <BrandMark />
          <span className="login-card__stamp">BOARDING · EMBARQUEMENT · EINSTIEG</span>
        </div>
        <h1 id="login-title">Sign in to your journal</h1>
        <p className="login-card__lead">
          Your journeys sync to every device and stay yours. No password to remember.
        </p>

        {configured ? (
          <LoginForm initialError={errorKey ? ERROR_COPY[errorKey] : undefined} />
        ) : (
          <p className="login-error" role="status">{ERROR_COPY.unconfigured}</p>
        )}

        <p className="login-card__guest">
          Prefer not to sign in? <Link href="/app">Open the map without an account</Link>. Journeys stay in this browser.
        </p>
      </section>
    </main>
  );
}
