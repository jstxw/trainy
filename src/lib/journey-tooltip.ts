import type { Coordinate, JourneyLeg } from "@/lib/domain";
import { operatorInitials } from "@/lib/airlines";
import { operatorLogoUrl } from "@/lib/rail-operators";

// Shared hover card for both the flat map (deck.gl getTooltip) and the planet
// view, which positions the same HTML itself.

export type OverlayPickable = JourneyLeg | { leg: JourneyLeg; coordinates: Coordinate; name?: string };

const TOOLTIP_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function operatorMark(leg: JourneyLeg, accent: string): string {
  const logoUrl = operatorLogoUrl(leg.mode, leg.operator, leg.number);
  if (logoUrl) {
    return `<img src="${logoUrl}" alt="" width="22" height="22" `
      + `style="position:absolute;top:0;right:0;border-radius:5px;border:1px solid rgba(37,43,99,0.12);background:#fff" `
      + `onerror="this.remove()" />`;
  }

  const initials = operatorInitials(leg.operator);
  if (!initials || leg.operator === "Unknown operator") return "";
  return `<span style="position:absolute;top:0;right:0;display:grid;place-items:center;width:22px;height:22px;`
    + `border-radius:50%;background:${accent}1f;color:${accent};font-weight:800;font-size:8px;letter-spacing:0.02em">`
    + `${escapeHtml(initials)}</span>`;
}

export function journeyTooltip({ object }: { object?: OverlayPickable | null }) {
  if (!object) return null;
  const leg = "leg" in object ? object.leg : object;
  const stopName = "leg" in object ? object.name : undefined;
  const accent = leg.mode === "rail" ? "#4046e0" : "#8055e8";
  const distanceKm = leg.mode === "rail" ? leg.railDistanceKm ?? leg.distanceKm : leg.distanceKm;
  const date = TOOLTIP_DATE.format(new Date(`${leg.travelDate}T12:00:00.000Z`));

  const mark = operatorMark(leg, accent);
  const lines = [
    stopName ? `<strong style="color:#252b63">${escapeHtml(stopName)}</strong>` : "",
    `<span style="color:${accent}">${escapeHtml(leg.number)}</span> · ${escapeHtml(leg.operator)}`,
    `${escapeHtml(leg.origin.city)} → ${escapeHtml(leg.destination.city)}`,
    `${escapeHtml(date)} · ${distanceKm.toLocaleString("en-GB")} km`,
  ].filter(Boolean).map((line) => `<div style="padding-right:${mark ? 28 : 0}px">${line}</div>`);

  return {
    html: `<div style="position:relative;display:grid;gap:3px">${mark}${lines.join("")}</div>`,
    style: {
      backgroundColor: "rgba(255, 255, 255, 0.95)",
      border: "1px solid rgba(37, 43, 99, 0.14)",
      borderRadius: "6px",
      padding: "8px 10px",
      color: "rgba(77, 83, 144, 0.95)",
      fontFamily: "var(--font-mono, monospace)",
      fontSize: "10px",
      backdropFilter: "blur(12px)",
      maxWidth: "260px",
    },
  };
}
