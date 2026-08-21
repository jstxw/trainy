import { TravelDashboard } from "@/components/travel-dashboard";
import { demoPlaces } from "@/lib/sample-data";
import { getLegs } from "@/lib/travel-log";

export default async function Home() {
  const legs = await getLegs();
  return <TravelDashboard initialLegs={legs} places={demoPlaces} />;
}
