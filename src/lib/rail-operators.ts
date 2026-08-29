import { findAirlineCode } from "./airlines.ts";

export type RailOperator = {
  name: string;
  country: string;
  code?: string;
  domain?: string;
};

// Curated European rail operators: national carriers, notable open-access and
// sleeper brands, and the larger regional franchises, sorted by name. Domains
// feed favicon-based logos; operators without one fall back to a monogram.
export const RAIL_OPERATORS: RailOperator[] = [
  { name: "Arlanda Express", country: "SE" },
  { name: "Arriva Nederland", country: "NL" },
  { name: "Arriva vlaky", country: "CZ" },
  { name: "Astra Trans Carpatic", country: "RO" },
  { name: "Avanti West Coast", country: "GB", domain: "avantiwestcoast.co.uk" },
  { name: "BDŽ", country: "BG" },
  { name: "BLS", country: "CH", domain: "bls.ch" },
  { name: "Belarusian Railway", country: "BY" },
  { name: "c2c", country: "GB", domain: "c2c-online.co.uk" },
  { name: "CFL", country: "LU", domain: "cfl.lu" },
  { name: "CFM", country: "MD" },
  { name: "CFR Călători", country: "RO" },
  { name: "CP Comboios de Portugal", country: "PT", code: "CP", domain: "cp.pt" },
  { name: "Caledonian Sleeper", country: "GB", domain: "sleeper.scot" },
  { name: "Chiltern Railways", country: "GB", domain: "chilternrailways.co.uk" },
  { name: "CrossCountry", country: "GB", domain: "crosscountrytrains.co.uk" },
  { name: "ČD České dráhy", country: "CZ", code: "ČD", domain: "cd.cz" },
  { name: "DSB", country: "DK", domain: "dsb.dk" },
  { name: "Deutsche Bahn", country: "DE", code: "DB", domain: "bahn.de" },
  { name: "East Midlands Railway", country: "GB", domain: "eastmidlandsrailway.co.uk" },
  { name: "Elron", country: "EE", domain: "elron.ee" },
  { name: "Eurostar", country: "FR", domain: "eurostar.com" },
  { name: "European Sleeper", country: "NL", domain: "europeansleeper.eu" },
  { name: "Euskotren", country: "ES", domain: "euskotren.eus" },
  { name: "FGC", country: "ES" },
  { name: "Fertagus", country: "PT" },
  { name: "FlixTrain", country: "DE", domain: "flixtrain.com" },
  { name: "Flytoget", country: "NO", domain: "flytoget.no" },
  { name: "GYSEV", country: "HU" },
  { name: "Go-Ahead Nordic", country: "NO" },
  { name: "Grand Central", country: "GB", domain: "grandcentralrail.com" },
  { name: "Great Western Railway", country: "GB", code: "GWR", domain: "gwr.com" },
  { name: "Greater Anglia", country: "GB", domain: "greateranglia.co.uk" },
  { name: "HŽPP", country: "HR" },
  { name: "Heathrow Express", country: "GB", domain: "heathrowexpress.com" },
  { name: "Hellenic Train", country: "GR", domain: "hellenictrain.gr" },
  { name: "Hull Trains", country: "GB", domain: "hulltrains.co.uk" },
  { name: "Iarnród Éireann", country: "IE", domain: "irishrail.ie" },
  { name: "Iryo", country: "ES", domain: "iryo.eu" },
  { name: "Italo NTV", country: "IT", code: "Italo", domain: "italotreno.com" },
  { name: "Koleje Mazowieckie", country: "PL" },
  { name: "LNER", country: "GB", domain: "lner.co.uk" },
  { name: "LTG Link", country: "LT", domain: "ltglink.lt" },
  { name: "Leo Express", country: "CZ", domain: "leoexpress.com" },
  { name: "Lumo", country: "GB", domain: "lumo.co.uk" },
  { name: "MÁV-START", country: "HU", code: "MÁV", domain: "mavcsoport.hu" },
  { name: "Merseyrail", country: "GB", domain: "merseyrail.org" },
  { name: "Metronom", country: "DE", domain: "der-metronom.de" },
  { name: "NS", country: "NL", domain: "ns.nl" },
  { name: "National Express Germany", country: "DE" },
  { name: "Northern", country: "GB", domain: "northernrailway.co.uk" },
  { name: "ODEG", country: "DE", domain: "odeg.de" },
  { name: "Ouigo", country: "FR", domain: "ouigo.com" },
  { name: "Ouigo España", country: "ES", domain: "ouigo.es" },
  { name: "PKP Intercity", country: "PL", code: "PKP", domain: "intercity.pl" },
  { name: "Pasažieru vilciens", country: "LV", domain: "pv.lv" },
  { name: "PolRegio", country: "PL", domain: "polregio.pl" },
  { name: "Renfe", country: "ES", domain: "renfe.com" },
  { name: "RegioJet", country: "CZ", domain: "regiojet.com" },
  { name: "Regio Călători", country: "RO" },
  { name: "Rhätische Bahn", country: "CH", domain: "rhb.ch" },
  { name: "SBB CFF FFS", country: "CH", code: "SBB", domain: "sbb.ch" },
  { name: "SJ", country: "SE", domain: "sj.se" },
  { name: "SJ Norge", country: "NO" },
  { name: "SKM Trójmiasto", country: "PL" },
  { name: "SNCB/NMBS", country: "BE", code: "SNCB", domain: "belgiantrain.be" },
  { name: "SNCF", country: "FR", domain: "sncf.com" },
  { name: "ScotRail", country: "GB", domain: "scotrail.co.uk" },
  { name: "Slovenske železnice", country: "SI", domain: "slo-zeleznice.si" },
  { name: "Snälltåget", country: "SE", domain: "snalltaget.se" },
  { name: "Southeastern", country: "GB", domain: "southeasternrailway.co.uk" },
  { name: "Southern", country: "GB", domain: "southernrailway.com" },
  { name: "Srbija Voz", country: "RS" },
  { name: "TCDD Taşımacılık", country: "TR", code: "TCDD", domain: "tcddtasimacilik.gov.tr" },
  { name: "TGV Lyria", country: "CH", domain: "tgv-lyria.com" },
  { name: "Thameslink", country: "GB", domain: "thameslinkrailway.com" },
  { name: "Transilien", country: "FR", domain: "transilien.com" },
  { name: "TransPennine Express", country: "GB", domain: "tpexpress.co.uk" },
  { name: "Transdev", country: "DE" },
  { name: "Transport for Wales", country: "GB", code: "TfW", domain: "tfw.wales" },
  { name: "Trenitalia", country: "IT", domain: "trenitalia.com" },
  { name: "Trenord", country: "IT", domain: "trenord.it" },
  { name: "Translink NI Railways", country: "GB", domain: "translink.co.uk" },
  { name: "Ukrzaliznytsia", country: "UA", code: "UZ", domain: "uz.gov.ua" },
  { name: "VR", country: "FI", domain: "vr.fi" },
  { name: "Vy", country: "NO", domain: "vy.no" },
  { name: "WESTbahn", country: "AT", domain: "westbahn.at" },
  { name: "West Midlands Railway", country: "GB", domain: "westmidlandsrailway.co.uk" },
  { name: "ZSSK", country: "SK", domain: "zssk.sk" },
  { name: "Zentralbahn", country: "CH", domain: "zentralbahn.ch" },
  { name: "ÖBB", country: "AT", domain: "oebb.at" },
  { name: "ÖBB Nightjet", country: "AT", code: "Nightjet", domain: "nightjet.com" },
  { name: "Öresundståg", country: "SE", domain: "oresundstag.se" },
];

export function findRailOperator(operator: string): RailOperator | null {
  const normalized = operator.trim().toLocaleLowerCase();
  if (!normalized) return null;
  return (
    RAIL_OPERATORS.find((entry) =>
      entry.name.toLocaleLowerCase() === normalized ||
      entry.code?.toLocaleLowerCase() === normalized,
    ) ?? null
  );
}

// One resolver for both modes: airline tail logos by IATA code, rail operator
// favicons by domain. Returns null when only a monogram fallback makes sense.
export function operatorLogoUrl(
  mode: "rail" | "air",
  operator: string,
  tripNumber?: string,
): string | null {
  if (mode === "air") {
    const code = findAirlineCode(operator, tripNumber);
    return code ? `https://images.kiwi.com/airlines/64x64/${code}.png` : null;
  }

  const domain = findRailOperator(operator)?.domain;
  return domain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
    : null;
}

export function searchRailOperators(query: string, limit = RAIL_OPERATORS.length): RailOperator[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return RAIL_OPERATORS.slice(0, limit);

  return RAIL_OPERATORS.filter((operator) =>
    operator.name.toLocaleLowerCase().includes(normalizedQuery) ||
    operator.country.toLocaleLowerCase() === normalizedQuery,
  ).slice(0, limit);
}
