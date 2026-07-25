// Deterministic, rule-based classification of an inbound email into a
// business-expense category. This intentionally runs before any AI-assisted
// step (none is wired up by default - see README "AI-assisted extraction").
//
// Rules are conservative: anything that doesn't clearly match a known vendor
// pattern falls through to OTHER_POTENTIAL with a low confidence score and
// must be manually reviewed before it counts toward confirmed totals.

import type { ClassificationResult, EmailInput, SourceType } from "./types";

const BUSINESS_CARD_LAST_FOUR = "4647";

// The mailbox owner's own address - any email sent from this address is
// ignored entirely (never classified, never turned into an expense).
const IGNORED_SENDER_ADDRESSES = ["firasalosman@gmail.com"];

// Only these exact senders are trusted for their respective categories -
// per the account owner's instruction, content-based matching (e.g. the
// word "Menkes" appearing in a forwarded email) is deliberately not enough.
const CONDO_RENTAL_SENDER = "donotreply@managebuilding.com";
const VIA_RAIL_SENDER = "no-reply@viarail.ca";
const MARRIOTT_RESERVATION_SENDER = "reservations@res-marriott.com";

function looksLikeCancellation(t: string): boolean {
  return /cancel(?:led|ed|lation)?/.test(t);
}

function text(input: EmailInput): string {
  return [input.subject, input.bodyText, ...(input.attachmentTexts ?? [])]
    .join("\n")
    .toLowerCase();
}

function senderDomain(sender: string): string {
  const match = sender.toLowerCase().match(/@([a-z0-9.-]+)/);
  return match ? match[1] : sender.toLowerCase();
}

function senderAddress(sender: string): string {
  const match = sender.toLowerCase().match(/([a-z0-9._%+-]+@[a-z0-9.-]+)/);
  return match ? match[1] : sender.toLowerCase();
}

const FINAL_DOC_KEYWORDS = [
  "invoice",
  "final invoice",
  "folio",
  "receipt",
  "closing invoice",
  "rental agreement",
  "payment confirmation",
  "e-ticket receipt",
];

const PRELIMINARY_KEYWORDS = [
  "booking confirmation",
  "reservation confirmed",
  "your reservation is confirmed",
  "authorization hold",
  "a hold has been placed",
  "itinerary",
];

function looksFinal(t: string): boolean {
  const hasFinal = FINAL_DOC_KEYWORDS.some((k) => t.includes(k));
  const hasPreliminary = PRELIMINARY_KEYWORDS.some((k) => t.includes(k));
  if (hasPreliminary && !hasFinal) return false;
  return hasFinal;
}

export function extractCardLast4(t: string): string | null {
  const match = t.match(/(?:card|visa|mastercard|amex)[^0-9]{0,20}(\d{4})\b/);
  return match ? match[1] : null;
}

export function classifyEmail(input: EmailInput): ClassificationResult {
  const t = text(input);
  const domain = senderDomain(input.sender);
  const address = senderAddress(input.sender);
  const isFinalDocument = looksFinal(t);

  // --- Ignore the mailbox owner's own outgoing/self-addressed email ---
  if (IGNORED_SENDER_ADDRESSES.includes(address)) {
    return {
      category: null,
      confidenceScore: 0,
      reason: `Sender ${address} is the mailbox owner's own address; ignored.`,
      isFinalDocument: false,
    };
  }

  // --- Toronto condo rental (Menkes, via ManageBuilding) ---
  // Only the exact sender below is trusted - content-based matching (e.g.
  // "Menkes" appearing in a forwarded/unrelated email) is intentionally not
  // sufficient.
  if (address === CONDO_RENTAL_SENDER) {
    return {
      category: "TORONTO_CONDO_RENTAL",
      confidenceScore: 0.95,
      reason: `Sender is ${CONDO_RENTAL_SENDER}, the trusted Menkes/ManageBuilding invoice sender.`,
      isFinalDocument: true,
    };
  }

  // --- VIA Rail ---
  // Only the exact sender below is trusted - content-based "via rail"
  // matching is intentionally not sufficient.
  if (address === VIA_RAIL_SENDER) {
    // For VIA Rail specifically, the "Booking confirmation" email is the one
    // that contains the ticket cost, so it's treated as the authoritative
    // document here (unlike hotels/car rentals, where a booking confirmation
    // is preliminary). Generic itinerary/update emails with no cost remain
    // non-final and go to review.
    const hasBookingConfirmation = t.includes("booking confirmation");
    const finalDoc = hasBookingConfirmation || isFinalDocument;
    const confidence = finalDoc ? 0.9 : 0.55;
    return {
      category: "RAIL_TRANSPORTATION",
      confidenceScore: confidence,
      reason: hasBookingConfirmation
        ? `Sender is ${VIA_RAIL_SENDER} with a "Booking confirmation" containing the ticket cost.`
        : isFinalDocument
          ? `Sender is ${VIA_RAIL_SENDER} with final e-ticket/receipt keywords.`
          : `Sender is ${VIA_RAIL_SENDER} but message looks like an itinerary/update rather than a final receipt.`,
      isFinalDocument: finalDoc,
    };
  }

  // --- Uber (business card only) ---
  if (domain.includes("uber.com") || t.includes("your trip with uber")) {
    const cardLast4 = extractCardLast4(t);
    if (cardLast4 && cardLast4 !== BUSINESS_CARD_LAST_FOUR) {
      return {
        category: "GROUND_TRANSPORTATION_UBER",
        confidenceScore: 0.2,
        reason: `Card ending ${cardLast4} does not match business card ${BUSINESS_CARD_LAST_FOUR}; excluded from business totals.`,
        isFinalDocument: true,
      };
    }
    return {
      category: "GROUND_TRANSPORTATION_UBER",
      confidenceScore: cardLast4 === BUSINESS_CARD_LAST_FOUR ? 0.88 : 0.5,
      reason:
        cardLast4 === BUSINESS_CARD_LAST_FOUR
          ? `Charged to business card ending ${BUSINESS_CARD_LAST_FOUR}.`
          : "Uber receipt found but card last-4 could not be confirmed; needs review.",
      isFinalDocument: true,
    };
  }

  // --- Hotels ---

  // Dedicated Marriott reservation-confirmation sender: these must be
  // captured as potential hotel expenses even when no final invoice/folio
  // is ever received - see README "Marriott reservation-confirmation rule".
  if (address === MARRIOTT_RESERVATION_SENDER) {
    if (looksLikeCancellation(t)) {
      return {
        category: "HOTEL",
        confidenceScore: 0.5,
        reason: `Cancellation email from ${MARRIOTT_RESERVATION_SENDER} - may relate to a previously captured reservation.`,
        isFinalDocument: false,
        sourceType: "POSSIBLE_CANCELLATION",
      };
    }
    return {
      category: "HOTEL",
      confidenceScore: 0.6,
      reason: "Marriott reservation confirmation captured because no final invoice may be available.",
      isFinalDocument: false,
      sourceType: "RESERVATION_CONFIRMATION",
    };
  }

  // "Marriott" always counts as a hotel match - whether it appears in the
  // sender, the email body, or attachment (invoice) text - even if none of
  // the generic hotel keywords below are present.
  const isMarriott = domain.includes("marriott") || address.includes("marriott") || t.includes("marriott");
  const hotelKeywords = [
    "hotel",
    "check-in",
    "check-out",
    "folio",
    "your stay",
    "reservation is confirmed",
  ];
  if (isMarriott || hotelKeywords.some((k) => t.includes(k))) {
    const isCancellation = looksLikeCancellation(t);
    if (isCancellation) {
      return {
        category: "HOTEL",
        confidenceScore: 0.5,
        reason: "Hotel cancellation email - may relate to a previously captured reservation.",
        isFinalDocument: false,
        sourceType: "POSSIBLE_CANCELLATION",
      };
    }
    const sourceType = isFinalDocument
      ? t.includes("invoice") || t.includes("folio")
        ? "FINAL_INVOICE"
        : "PAID_RECEIPT"
      : "RESERVATION_CONFIRMATION";
    return {
      category: "HOTEL",
      confidenceScore: isFinalDocument ? 0.9 : isMarriott ? 0.6 : 0.5,
      reason: isMarriott
        ? "Marriott match (sender, body, or attachment text) - always treated as a hotel expense."
        : isFinalDocument
          ? "Final hotel folio/receipt with paid amount."
          : "Hotel booking confirmation only; prefer the final folio/invoice when it arrives.",
      isFinalDocument,
      sourceType,
    };
  }

  // --- Car rentals ---
  const carRentalCompanies = ["hertz", "avis", "enterprise", "budget", "national car"];
  const carKeywords = [
    "rental agreement",
    "car rental",
    "vehicle rental",
    "rental receipt",
    "your rental",
    "for your rental",
  ];
  if (
    carRentalCompanies.some((c) => domain.includes(c) || t.includes(c)) ||
    carKeywords.some((k) => t.includes(k))
  ) {
    const isHold = t.includes("authorization hold") || t.includes("a hold has been placed");
    return {
      category: "CAR_RENTAL",
      confidenceScore: isHold ? 0.4 : isFinalDocument ? 0.9 : 0.55,
      reason: isHold
        ? "Message describes a card authorization hold, not a final rental invoice."
        : isFinalDocument
          ? "Final rental agreement/closing invoice."
          : "Car rental related but not clearly a final invoice.",
      isFinalDocument: isFinalDocument && !isHold,
    };
  }

  // --- Fallback: possible business expense, needs manual review ---
  const genericReceiptKeywords = ["receipt", "invoice", "order confirmation", "payment"];
  if (genericReceiptKeywords.some((k) => t.includes(k))) {
    return {
      category: "OTHER_POTENTIAL",
      confidenceScore: 0.3,
      reason: "Generic receipt/invoice keywords matched but no known business-expense category applies.",
      isFinalDocument,
    };
  }

  return {
    category: null,
    confidenceScore: 0,
    reason: "No business-expense indicators found.",
    isFinalDocument: false,
  };
}

// Derives the final SourceType for an expense once the amount has been
// extracted: a reservation confirmation with no amount downgrades to the
// "missing amount" variant. Anything classification.ts didn't set
// explicitly falls back to FINAL_INVOICE (when it looks like a final
// document) or UNKNOWN.
export function resolveSourceType(result: ClassificationResult, hasAmount: boolean): SourceType {
  const sourceType: SourceType = result.sourceType ?? (result.isFinalDocument ? "FINAL_INVOICE" : "UNKNOWN");
  if (sourceType === "RESERVATION_CONFIRMATION" && !hasAmount) {
    return "RESERVATION_CONFIRMATION_MISSING_AMOUNT";
  }
  return sourceType;
}
