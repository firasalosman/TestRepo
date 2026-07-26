// Per-category Gmail search queries, restricted to the 2026 expense window.
// Card-last-4 filtering for Uber cannot be expressed in a Gmail search query
// (Gmail can't inspect the body for arbitrary digits reliably), so Uber
// results are fetched broadly here and filtered after body/attachment
// extraction in the sync pipeline - see src/lib/sync.ts.
//
// classification.ts is the source of truth for the exact trusted senders
// (donotreply@managebuilding.com, no-reply@viarail.ca) and the ignored
// self-address (firasalosman@gmail.com) - these query strings mirror those
// same constraints so we don't even fetch messages that classification
// would reject anyway.

const DATE_RANGE = "after:2026/01/01 before:2027/01/01";
const EXCLUDE_SELF = "-from:firasalosman@gmail.com";

export const CATEGORY_QUERIES: { category: string; query: string }[] = [
  {
    category: "HOTEL",
    query: `${DATE_RANGE} ${EXCLUDE_SELF} (receipt OR invoice OR folio OR "booking confirmation" OR "your stay") (hotel OR "check-in" OR "check-out" OR reservation)`,
  },
  {
    // Marriott always counts as a hotel expense (see classification.ts), so
    // it gets its own broad query - independent of the generic hotel
    // keyword query above, which a Marriott email might not otherwise match
    // (e.g. if its subject/body doesn't say "hotel" or "check-in").
    category: "HOTEL",
    query: `${DATE_RANGE} ${EXCLUDE_SELF} (from:marriott.com OR marriott)`,
  },
  {
    // res-marriott.com is a DIFFERENT domain than marriott.com (not a
    // subdomain) - Gmail's from: operator does not reliably match one
    // against the other, so the reservation-confirmation sender trusted by
    // classification.ts needs its own dedicated query rather than relying
    // solely on the bare "marriott" keyword above.
    category: "HOTEL",
    query: `${DATE_RANGE} from:res-marriott.com`,
  },
  {
    category: "CAR_RENTAL",
    query: `${DATE_RANGE} ${EXCLUDE_SELF} (rental OR "rental agreement" OR receipt OR invoice) (car OR vehicle) (Hertz OR Avis OR Enterprise OR Budget OR "National Car")`,
  },
  {
    category: "TORONTO_CONDO_RENTAL",
    // Only the trusted ManageBuilding invoice sender - see classification.ts.
    query: `${DATE_RANGE} from:donotreply@managebuilding.com`,
  },
  {
    category: "GROUND_TRANSPORTATION_UBER",
    query: `${DATE_RANGE} ${EXCLUDE_SELF} from:uber.com (receipt OR trip OR "your trip")`,
  },
  {
    category: "RAIL_TRANSPORTATION",
    // Only the trusted VIA Rail sender - see classification.ts.
    query: `${DATE_RANGE} from:no-reply@viarail.ca`,
  },
  {
    category: "OTHER_POTENTIAL",
    query: `${DATE_RANGE} ${EXCLUDE_SELF} (receipt OR invoice OR "order confirmation" OR payment) -from:uber.com -from:donotreply@managebuilding.com -from:no-reply@viarail.ca`,
  },
];
