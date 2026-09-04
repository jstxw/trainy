import { LaunchPage } from "@/components/launch-page";
import { isSupabaseConfigured } from "@/lib/supabase-env";

export default function Home() {
  return <LaunchPage signIn={{ configured: isSupabaseConfigured(), initiallyOpen: false }} />;
}
