// Per-category Gmail search queries, restricted to the 2026 expense window.
// Card-last-4 filtering for Uber cannot be expressed in a Gmail search query
// (Gmail can't inspect the body for arbitrary digits reliably), so Uber
// results are fetched broadly here and filtered after body/attachment
// extraction in the sync pipeline - see src/lib/sync.ts.

const DATE_RANGE = "after:2026/01/01 before:2027/01/01";

export const CATEGORY_QUERIES: { category: string; query: string }[] = [
  {
    category: "HOTEL",
    query: `${DATE_RANGE} (receipt OR invoice OR folio OR "booking confirmation" OR "your stay") (hotel OR "check-in" OR "check-out" OR reservation)`,
  },
  {
    category: "CAR_RENTAL",
    query: `${DATE_RANGE} (rental OR "rental agreement" OR receipt OR invoice) (car OR vehicle) (Hertz OR Avis OR Enterprise OR Budget OR "National Car")`,
  },
  {
    category: "TORONTO_CONDO_RENTAL",
    query: `${DATE_RANGE} (from:menkes.com OR "Menkes" OR "771 Yonge")`,
  },
  {
    category: "GROUND_TRANSPORTATION_UBER",
    query: `${DATE_RANGE} from:uber.com (receipt OR trip OR "your trip")`,
  },
  {
    category: "RAIL_TRANSPORTATION",
    query: `${DATE_RANGE} (from:viarail.ca OR "VIA Rail") (ticket OR receipt OR confirmation OR itinerary)`,
  },
  {
    category: "OTHER_POTENTIAL",
    query: `${DATE_RANGE} (receipt OR invoice OR "order confirmation" OR payment) -from:uber.com -from:menkes.com -from:viarail.ca`,
  },
];
