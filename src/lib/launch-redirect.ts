/**
 * Where the proxy should send a request, or null to let it through.
 * Only signed-in visitors at the launch page are redirected, into the app.
 */
export function launchRedirectTarget(pathname: string, signedIn: boolean): string | null {
  if (pathname === "/" && signedIn) return "/app";
  return null;
}
