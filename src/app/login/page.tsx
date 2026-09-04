import type { Metadata } from "next";
import { LaunchPage } from "@/components/launch-page";
import { SIGN_IN_ERROR_COPY } from "@/components/sign-in-dialog";
import { isSupabaseConfigured } from "@/lib/supabase-env";

export const metadata: Metadata = {
  title: "Sign in — Trainy",
};

// /login is the launch page with the sign-in dialog already open, so auth
// redirects (expired link, Google failure) land on the same hero as the button.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const errorKey = Array.isArray(error) ? error[0] : error;

  return (
    <LaunchPage
      signIn={{
        configured: isSupabaseConfigured(),
        initiallyOpen: true,
        initialError: errorKey ? SIGN_IN_ERROR_COPY[errorKey] : undefined,
      }}
    />
  );
}
