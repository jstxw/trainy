import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase-server";

/**
 * Finishes a sign-in. Magic links and OAuth both land here: OAuth and PKCE
 * magic links carry `code`; older-style magic links carry `token_hash` and
 * `type`. Either way the session cookie is set by the SSR client and the
 * visitor continues into the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.redirect(`${origin}/login?error=unconfigured`);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/app`);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}/app`);
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
