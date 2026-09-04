"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/app/login/login-form";

export const SIGN_IN_ERROR_COPY: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Request a new one.",
  google: "Google sign-in could not start. Try again or use an email link.",
  unconfigured: "Sign-in is not configured on this deployment.",
};

/**
 * Sign-in as a modal over whatever page opened it, so the launch page's maps
 * keep running behind the blur instead of being replaced by a second page.
 */
export function SignInDialog({
  configured,
  initialError,
  onClose,
}: {
  configured: boolean;
  initialError?: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="login-overlay"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section className="login-card" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <button ref={closeRef} type="button" className="login-close" onClick={onClose} aria-label="Close sign in">
          <X size={20} aria-hidden="true" />
        </button>
        <div className="login-card__brand">
          <span className="login-card__wordmark"><BrandMark /><strong>Trainy</strong></span>
          <span className="login-card__stamp">EUROPEAN TRAVEL PASSPORT</span>
        </div>
        <h1 id="login-title">Welcome back</h1>
        <p className="login-card__lead">
          Sign in to continue mapping your European rail and air journeys.
        </p>

        {configured ? (
          <LoginForm initialError={initialError} />
        ) : (
          <p className="login-error" role="status">{SIGN_IN_ERROR_COPY.unconfigured}</p>
        )}

        <p className="login-card__guest">
          Prefer not to sign in? <Link href="/app">Open the European map without an account</Link>.
        </p>
      </section>
    </div>
  );
}
