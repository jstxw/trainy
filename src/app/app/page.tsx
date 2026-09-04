import { connection } from "next/server";
import { TravelDashboard } from "@/components/travel-dashboard";
import { getPersistenceMode } from "@/lib/journey-repository";
import { getSessionUser } from "@/lib/supabase-server";
import { getLegs } from "@/lib/travel-log";

export default async function AppPage() {
  // Personal rows and runtime environment must never be captured in build
  // output, and the session cookie is only available at request time.
  await connection();

  const [user, persistence, legs] = await Promise.all([
    getSessionUser(),
    getPersistenceMode(),
    getLegs(),
  ]);

  return (
    <TravelDashboard
      initialLegs={legs}
      persistence={persistence}
      account={user?.email ? { email: user.email } : null}
    />
  );
}
