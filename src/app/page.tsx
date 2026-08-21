import { connection } from "next/server";
import { TravelDashboard } from "@/components/travel-dashboard";
import { getPersistenceMode } from "@/lib/journey-repository";
import { getLegs } from "@/lib/travel-log";

export default async function Home() {
  // A database-backed personal journal must never be captured in build output.
  // It also keeps server environment variables runtime-configurable on deploys.
  await connection();
  const legs = await getLegs();
  return <TravelDashboard initialLegs={legs} persistence={getPersistenceMode()} />;
}
