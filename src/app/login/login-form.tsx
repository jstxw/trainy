"use client";

import { useActionState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { sendMagicLink, signInWithGoogle, type LoginState } from "@/app/login/actions";

const INITIAL_STATE: LoginState = { status: "idle" };

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, submit, pending] = useActionState(sendMagicLink, INITIAL_STATE);

  if (state.status === "sent") {
    return (
      <div className="login-sent" role="status">
        <span className="login-sent__icon"><Mail size={22} aria-hidden="true" /></span>
        <strong>Check your inbox</strong>
        <p>We sent a sign-in link to <b>{state.email}</b>. Open it on this device to land in your journal.</p>
      </div>
    );
  }

  const error = state.status === "error" ? state.message : initialError;

  return (
    <div className="login-methods">
      <form action={signInWithGoogle}>
        <button className="login-google" type="submit">
          <GoogleMark />
          Continue with Google
        </button>
      </form>

      <div className="login-divider" aria-hidden="true"><span>or</span></div>

      <form action={submit} className="login-form" noValidate>
        <label>
          <span className="field-label">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            defaultValue={state.email ?? ""}
            required
            aria-invalid={Boolean(error) || undefined}
          />
        </label>
        <button className="login-submit" type="submit" disabled={pending}>
          {pending ? "Sending link…" : "Email me a sign-in link"}
          {!pending && <ArrowRight size={16} aria-hidden="true" />}
        </button>
        {error && <p className="login-error" role="alert">{error}</p>}
      </form>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.5 13.3l7.9 6.1C12.3 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
      <path fill="#FBBC05" d="M10.4 28.6A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.5-5.7l-7.6-5.9c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
