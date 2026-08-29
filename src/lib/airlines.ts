export type Airline = {
  name: string;
  country: string;
  code: string;
};

// Major scheduled airlines worldwide, sorted by name. The journey form still
// accepts free text for carriers that are not listed here.
export const AIRLINES: Airline[] = [
  { name: "Aegean Airlines", country: "GR", code: "A3" },
  { name: "Aer Lingus", country: "IE", code: "EI" },
  { name: "Aerolíneas Argentinas", country: "AR", code: "AR" },
  { name: "Aeroméxico", country: "MX", code: "AM" },
  { name: "Air Algérie", country: "DZ", code: "AH" },
  { name: "Air Astana", country: "KZ", code: "KC" },
  { name: "Air Baltic", country: "LV", code: "BT" },
  { name: "Air Canada", country: "CA", code: "AC" },
  { name: "Air China", country: "CN", code: "CA" },
  { name: "Air Europa", country: "ES", code: "UX" },
  { name: "Air France", country: "FR", code: "AF" },
  { name: "Air India", country: "IN", code: "AI" },
  { name: "Air Mauritius", country: "MU", code: "MK" },
  { name: "Air New Zealand", country: "NZ", code: "NZ" },
  { name: "Air Serbia", country: "RS", code: "JU" },
  { name: "Air Transat", country: "CA", code: "TS" },
  { name: "AirAsia", country: "MY", code: "AK" },
  { name: "Airlink", country: "ZA", code: "4Z" },
  { name: "Alaska Airlines", country: "US", code: "AS" },
  { name: "All Nippon Airways", country: "JP", code: "NH" },
  { name: "American Airlines", country: "US", code: "AA" },
  { name: "Asiana Airlines", country: "KR", code: "OZ" },
  { name: "Austrian Airlines", country: "AT", code: "OS" },
  { name: "Avianca", country: "CO", code: "AV" },
  { name: "Azerbaijan Airlines", country: "AZ", code: "J2" },
  { name: "Azul", country: "BR", code: "AD" },
  { name: "Bangkok Airways", country: "TH", code: "PG" },
  { name: "British Airways", country: "GB", code: "BA" },
  { name: "Brussels Airlines", country: "BE", code: "SN" },
  { name: "Cathay Pacific", country: "HK", code: "CX" },
  { name: "Cebu Pacific", country: "PH", code: "5J" },
  { name: "China Airlines", country: "TW", code: "CI" },
  { name: "China Eastern", country: "CN", code: "MU" },
  { name: "China Southern", country: "CN", code: "CZ" },
  { name: "Condor", country: "DE", code: "DE" },
  { name: "Copa Airlines", country: "PA", code: "CM" },
  { name: "Croatia Airlines", country: "HR", code: "OU" },
  { name: "Delta Air Lines", country: "US", code: "DL" },
  { name: "Discover Airlines", country: "DE", code: "4Y" },
  { name: "EgyptAir", country: "EG", code: "MS" },
  { name: "El Al", country: "IL", code: "LY" },
  { name: "Emirates", country: "AE", code: "EK" },
  { name: "Ethiopian Airlines", country: "ET", code: "ET" },
  { name: "Etihad Airways", country: "AE", code: "EY" },
  { name: "Eurowings", country: "DE", code: "EW" },
  { name: "EVA Air", country: "TW", code: "BR" },
  { name: "easyJet", country: "GB", code: "U2" },
  { name: "Fiji Airways", country: "FJ", code: "FJ" },
  { name: "Finnair", country: "FI", code: "AY" },
  { name: "flydubai", country: "AE", code: "FZ" },
  { name: "Frontier Airlines", country: "US", code: "F9" },
  { name: "Garuda Indonesia", country: "ID", code: "GA" },
  { name: "GOL Linhas Aéreas", country: "BR", code: "G3" },
  { name: "Gulf Air", country: "BH", code: "GF" },
  { name: "Hainan Airlines", country: "CN", code: "HU" },
  { name: "Hawaiian Airlines", country: "US", code: "HA" },
  { name: "Iberia", country: "ES", code: "IB" },
  { name: "Icelandair", country: "IS", code: "FI" },
  { name: "IndiGo", country: "IN", code: "6E" },
  { name: "ITA Airways", country: "IT", code: "AZ" },
  { name: "Japan Airlines", country: "JP", code: "JL" },
  { name: "Jet2", country: "GB", code: "LS" },
  { name: "JetBlue", country: "US", code: "B6" },
  { name: "Jetstar", country: "AU", code: "JQ" },
  { name: "Kenya Airways", country: "KE", code: "KQ" },
  { name: "KLM", country: "NL", code: "KL" },
  { name: "Korean Air", country: "KR", code: "KE" },
  { name: "Kuwait Airways", country: "KW", code: "KU" },
  { name: "LATAM Airlines", country: "CL", code: "LA" },
  { name: "LOT Polish Airlines", country: "PL", code: "LO" },
  { name: "Lufthansa", country: "DE", code: "LH" },
  { name: "Luxair", country: "LU", code: "LG" },
  { name: "Malaysia Airlines", country: "MY", code: "MH" },
  { name: "Middle East Airlines", country: "LB", code: "ME" },
  { name: "Norwegian", country: "NO", code: "DY" },
  { name: "Oman Air", country: "OM", code: "WY" },
  { name: "Pegasus Airlines", country: "TR", code: "PC" },
  { name: "Philippine Airlines", country: "PH", code: "PR" },
  { name: "Play", country: "IS", code: "OG" },
  { name: "Qantas", country: "AU", code: "QF" },
  { name: "Qatar Airways", country: "QA", code: "QR" },
  { name: "Royal Air Maroc", country: "MA", code: "AT" },
  { name: "Royal Brunei", country: "BN", code: "BI" },
  { name: "Royal Jordanian", country: "JO", code: "RJ" },
  { name: "RwandAir", country: "RW", code: "WB" },
  { name: "Ryanair", country: "IE", code: "FR" },
  { name: "SAS", country: "SE", code: "SK" },
  { name: "Saudia", country: "SA", code: "SV" },
  { name: "Scoot", country: "SG", code: "TR" },
  { name: "Singapore Airlines", country: "SG", code: "SQ" },
  { name: "South African Airways", country: "ZA", code: "SA" },
  { name: "Southwest Airlines", country: "US", code: "WN" },
  { name: "Spirit Airlines", country: "US", code: "NK" },
  { name: "SriLankan Airlines", country: "LK", code: "UL" },
  { name: "SunExpress", country: "TR", code: "XQ" },
  { name: "Sun Country Airlines", country: "US", code: "SY" },
  { name: "Swiss", country: "CH", code: "LX" },
  { name: "TAP Air Portugal", country: "PT", code: "TP" },
  { name: "Thai Airways", country: "TH", code: "TG" },
  { name: "Transavia", country: "NL", code: "HV" },
  { name: "TUI fly", country: "BE", code: "TB" },
  { name: "Tunisair", country: "TN", code: "TU" },
  { name: "Turkish Airlines", country: "TR", code: "TK" },
  { name: "United Airlines", country: "US", code: "UA" },
  { name: "Uzbekistan Airways", country: "UZ", code: "HY" },
  { name: "Vietnam Airlines", country: "VN", code: "VN" },
  { name: "VietJet Air", country: "VN", code: "VJ" },
  { name: "Virgin Atlantic", country: "GB", code: "VS" },
  { name: "Virgin Australia", country: "AU", code: "VA" },
  { name: "Vistara", country: "IN", code: "UK" },
  { name: "Volaris", country: "MX", code: "Y4" },
  { name: "Vueling", country: "ES", code: "VY" },
  { name: "WestJet", country: "CA", code: "WS" },
  { name: "Wizz Air", country: "HU", code: "W6" },
  { name: "Xiamen Airlines", country: "CN", code: "MF" },
];

// Resolves an operator to an IATA code for logo lookups: an exact name match
// against the airline list first, then the flight number's carrier prefix.
export function findAirlineCode(operator: string, flightNumber?: string): string | null {
  const normalized = operator.trim().toLocaleLowerCase();
  const listed = AIRLINES.find((airline) => airline.name.toLocaleLowerCase() === normalized);
  if (listed) return listed.code;
  return flightNumber?.match(/^([A-Z0-9]{2})\s?\d/)?.[1] ?? null;
}

export function operatorInitials(operator: string): string {
  return operator
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase();
}

export function searchAirlines(query: string, limit = AIRLINES.length): Airline[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return AIRLINES.slice(0, limit);

  return AIRLINES.filter((airline) =>
    airline.name.toLocaleLowerCase().includes(normalizedQuery) ||
    airline.country.toLocaleLowerCase() === normalizedQuery ||
    airline.code.toLocaleLowerCase() === normalizedQuery,
  ).slice(0, limit);
}
