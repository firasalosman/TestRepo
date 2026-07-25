// Deterministic, rule-based classification of an inbound email into a
// business-expense category. This intentionally runs before any AI-assisted
// step (none is wired up by default - see README "AI-assisted extraction").
//
// Rules are conservative: anything that doesn't clearly match a known vendor
// pattern falls through to OTHER_POTENTIAL with a low confidence score and
// must be manually reviewed before it counts toward confirmed totals.

import type { ClassificationResult, EmailInput } from "./types";

const BUSINESS_CARD_LAST_FOUR = "4647";

function text(input: EmailInput): string {
  return [input.subject, input.bodyText, ...(input.attachmentTexts ?? [])]
    .join("\n")
    .toLowerCase();
}

function senderDomain(sender: string): string {
  const match = sender.toLowerCase().match(/@([a-z0-9.-]+)/);
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

function extractCardLast4(t: string): string | null {
  const match = t.match(/(?:card|visa|mastercard|amex)[^0-9]{0,20}(\d{4})\b/);
  return match ? match[1] : null;
}

export function classifyEmail(input: EmailInput): ClassificationResult {
  const t = text(input);
  const domain = senderDomain(input.sender);
  const isFinalDocument = looksFinal(t);

  // --- Toronto condo rental (Menkes) ---
  if (
    domain.includes("menkes.com") ||
    t.includes("menkes") ||
    t.includes("771 yonge")
  ) {
    return {
      category: "TORONTO_CONDO_RENTAL",
      confidenceScore: 0.95,
      reason:
        'Sender/content matches Menkes property management and/or address "771 Yonge Street, Toronto".',
      isFinalDocument: true,
    };
  }

  // --- VIA Rail ---
  if (domain.includes("viarail.ca") || t.includes("via rail")) {
    const confidence = isFinalDocument ? 0.9 : 0.55;
    return {
      category: "RAIL_TRANSPORTATION",
      confidenceScore: confidence,
      reason: isFinalDocument
        ? "VIA Rail sender with final e-ticket/receipt keywords."
        : "VIA Rail sender but message looks like an itinerary/update rather than a final receipt.",
      isFinalDocument,
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
  const hotelKeywords = [
    "hotel",
    "check-in",
    "check-out",
    "folio",
    "your stay",
    "reservation is confirmed",
  ];
  if (hotelKeywords.some((k) => t.includes(k))) {
    return {
      category: "HOTEL",
      confidenceScore: isFinalDocument ? 0.9 : 0.5,
      reason: isFinalDocument
        ? "Final hotel folio/receipt with paid amount."
        : "Hotel booking confirmation only; prefer the final folio/invoice when it arrives.",
      isFinalDocument,
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
