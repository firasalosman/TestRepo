// Best-effort pickup/drop-off location extraction from an Uber receipt's
// text, used to determine whether a trip took place outside both Ottawa
// and Toronto (see classification.ts's Uber rule). Kept as its own module
// (rather than folded into classification.ts or fieldExtraction.ts) so
// both can import it without creating a circular dependency, since
// fieldExtraction.ts already imports extractCardLast4 from classification.ts.
//
// Matching is intentionally case-sensitive (relies on capitalized city
// names) - see fieldExtraction.ts's `sanitize`/`ci` comments for why mixing
// that with a case-insensitive regex flag silently breaks it.

const CA_PROVINCES = new Set(["ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "PE", "NL", "NT", "YT", "NU"]);
const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
  "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);
const REGION_CODES = [...CA_PROVINCES, ...US_STATES].join("|");

// "123 King St W, Toronto, ON" or just "Toronto, ON" - an optional
// street-address lead-in followed by a capitalized city name and a
// Canadian province / US state code.
const LOCATION_RE = new RegExp(
  `((?:\\d+[^\\n,]{0,40},[ \\t]*)?[A-Z][a-zA-Z.'-]*(?:[ \\t]+[A-Z][a-zA-Z.'-]*){0,2}),[ \\t]*(${REGION_CODES})\\b`,
  "g",
);

interface LocationMatch {
  snippet: string;
  city: string;
  country: string;
}

function findLocationMatches(text: string): LocationMatch[] {
  const matches: LocationMatch[] = [];
  let m: RegExpExecArray | null;
  // Reset lastIndex since LOCATION_RE is a shared `g` regex.
  LOCATION_RE.lastIndex = 0;
  while ((m = LOCATION_RE.exec(text)) !== null) {
    const region = m[2];
    // The city name is the last capitalized-word run immediately before
    // the region code, i.e. after any leading "123 Main St," portion.
    const cityMatch = m[1].match(/([A-Z][a-zA-Z.'-]*(?:[ \t]+[A-Z][a-zA-Z.'-]*){0,2})$/);
    const city = (cityMatch ? cityMatch[1] : m[1]).trim();
    matches.push({
      snippet: m[0].trim(),
      city,
      country: CA_PROVINCES.has(region) ? "Canada" : "United States",
    });
  }
  return matches;
}

export interface UberTripLocations {
  pickupAddress?: string;
  pickupCity?: string;
  dropoffAddress?: string;
  dropoffCity?: string;
  tripCountry?: string;
}

// Uber receipts conventionally list the pickup location before the
// drop-off location, so the first two distinct location matches in the
// text are treated as pickup then drop-off, best-effort.
export function extractUberTripLocations(text: string): UberTripLocations {
  const matches = findLocationMatches(text);
  if (matches.length === 0) return {};

  const [pickup, dropoff] = matches;
  return {
    pickupAddress: pickup?.snippet,
    pickupCity: pickup?.city,
    dropoffAddress: dropoff?.snippet,
    dropoffCity: dropoff?.city,
    tripCountry: pickup?.country ?? dropoff?.country,
  };
}

const OTTAWA_TORONTO = new Set(["ottawa", "toronto"]);

// true  - neither pickup nor drop-off city is Ottawa or Toronto (confirmed outside)
// false - at least one of pickup/drop-off is Ottawa or Toronto
// undefined - no city could be extracted at all; caller should not treat
//             this as "outside" (that would be guessing) - the existing
//             card-based rule remains the deciding factor in that case.
export function isOutsideOttawaAndToronto(locations: UberTripLocations): boolean | undefined {
  const cities = [locations.pickupCity, locations.dropoffCity].filter((c): c is string => Boolean(c));
  if (cities.length === 0) return undefined;
  return cities.every((c) => !OTTAWA_TORONTO.has(c.toLowerCase()));
}
