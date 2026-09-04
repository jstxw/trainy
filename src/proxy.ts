import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { launchRedirectTarget } from "@/lib/launch-redirect";
import { readSupabaseEnv } from "@/lib/supabase-env";

/**
 * Keeps the Supabase session cookie fresh on every page request and sends
 * signed-in visitors from the launch page into the app. Nothing here gates
 * access: guests may open /app, and every server function re-checks the user.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = readSupabaseEnv(process.env);
  if (!env) return response;

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  let signedIn = false;
  try {
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } catch {
    // A failed refresh must never block the page; the visitor renders as a guest.
  }

  const target = launchRedirectTarget(request.nextUrl.pathname, signedIn);
  if (!target) return response;

  const redirect = NextResponse.redirect(new URL(target, request.url));
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|maplibre|images|api/places|.*\\.(?:svg|png|jpg|jpeg|webp|ico|css|js|mjs|json)$).*)",
  ],
};
