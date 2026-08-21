import { TravelDashboard } from "@/components/travel-dashboard";
import { getPersistenceMode } from "@/lib/journey-repository";
import { getLegs } from "@/lib/travel-log";

export default async function Home() {
  const legs = await getLegs();
  return <TravelDashboard initialLegs={legs} persistence={getPersistenceMode()} />;
}
