import type { Metadata } from "next";
import { IBM_Plex_Mono, Nunito_Sans } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  weight: "variable",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Trainy — Your European journeys, mapped",
  description: "Every European train and flight you take, drawn on one map. A map-first travel passport for rail and air across Europe.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunitoSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
