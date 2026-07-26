// Regex-based structured-field extraction from email body / attachment
// text. This runs after classification and is intentionally conservative:
// when a field can't be found confidently, it's left undefined so the
// caller (src/lib/sync.ts) can lower the confidence score and flag the
// expense for review rather than guessing.

import { extractCardLast4 } from "./classification";

export interface ExtractedFields {
  amount?: number;
  currency?: string;
  taxAmount?: number;
  invoiceNumber?: string;
  cardLast4?: string;
  tripRoute?: string;
  hotelCheckIn?: Date;
  hotelCheckOut?: Date;
  hotelName?: string;
  hotelCity?: string;
  guestName?: string;
  serviceDate?: Date;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
};

const CURRENCY_CODES = ["CAD", "USD", "EUR", "GBP"];

function parseAmountToken(token: string): number {
  return Number(token.replace(/,/g, ""));
}

// Case-insensitive-safe label matcher: expands a literal word into a
// character-class-per-letter pattern (e.g. "guest" -> "[Gg][Uu][Ee][Ss][Tt]")
// so the label can match either case WITHOUT compiling the whole regex with
// the `i` flag. That distinction matters here: several patterns below use
// `[A-Z]` elsewhere in the same regex specifically to mean "looks like a
// capitalized proper noun / uppercase code" - compiling with `i` would make
// `[A-Z]` match lowercase too and defeat that heuristic entirely, which is
// exactly what let real (non-mock) email text produce garbage extractions
// like guestName "s per room" or hotelCity "We".
function ci(word: string): string {
  return word
    .split("")
    .map((c) => (/[a-zA-Z]/.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : c))
    .join("");
}

// Trims, collapses whitespace, and rejects implausible extracted values
// (too short, too long, or spanning multiple lines) rather than storing
// them - used for hotel name/city/guest name/invoice number extraction.
function sanitize(value: string | undefined, maxLength = 80): string | undefined {
  if (!value) return undefined;
  if (/[\r\n]/.test(value)) return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length < 2 || cleaned.length > maxLength) return undefined;
  return cleaned;
}

export function extractAmount(text: string): { amount: number; currency: string } | undefined {
  // "Total: CAD $123.45", "Amount paid: $612.40", "Total paid CAD 612.40",
  // "Fare: $168.50", "Ticket price: $214.75" (typical VIA Rail booking
  // confirmation wording, which is the authoritative cost source for rail).
  const labeled = text.match(
    /(?:total(?:\s+paid)?|amount\s*(?:paid|due|charged)?|balance\s*due|grand\s*total|fare|ticket\s*price|total\s*cost)\s*:?\s*(CAD|USD|EUR|GBP)?\s*([$€£])?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
  );
  if (labeled) {
    const [, code, symbol, amountStr] = labeled;
    const currency = code?.toUpperCase() || (symbol ? CURRENCY_SYMBOLS[symbol] : undefined) || "CAD";
    return { amount: parseAmountToken(amountStr), currency };
  }

  // Fallback: first currency-looking token anywhere in the text.
  const generic = text.match(/(CAD|USD|EUR|GBP)?\s*([$€£])\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
  if (generic) {
    const [, code, symbol, amountStr] = generic;
    const currency = code?.toUpperCase() || CURRENCY_SYMBOLS[symbol] || "CAD";
    return { amount: parseAmountToken(amountStr), currency };
  }

  const codeFirst = text.match(/(CAD|USD|EUR|GBP)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i);
  if (codeFirst) {
    return { amount: parseAmountToken(codeFirst[2]), currency: codeFirst[1].toUpperCase() };
  }

  // Fallback for receipts with no currency symbol AND no English label near
  // the total (common on Canadian/bilingual hotel folios) - a line showing
  // the card payment, e.g. "CCARD-VS ROOM C/O 357.45" or "CARD PAYMENT
  // 357.45".
  const cardPaymentLine = text.match(/C\/?CARD[^\d\n]{0,20}(\d{1,3}(?:,\d{3})*\.\d{2})/i);
  if (cardPaymentLine) {
    return { amount: parseAmountToken(cardPaymentLine[1]), currency: "CAD" };
  }

  // Last resort: the amount that appears more than once anywhere in the
  // text. Final totals conventionally repeat (once on a payment line, once
  // in a closing summary table), so a repeated money-shaped value is a
  // reasonable proxy for "the total" when no label or symbol is present.
  const allAmounts = [...text.matchAll(/\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/g)].map((m) => m[1]);
  const counts = new Map<string, number>();
  for (const n of allAmounts) counts.set(n, (counts.get(n) ?? 0) + 1);
  let repeated: string | undefined;
  let maxCount = 1;
  for (const [n, c] of counts) {
    if (c > maxCount) {
      maxCount = c;
      repeated = n;
    }
  }
  if (repeated) {
    return { amount: parseAmountToken(repeated), currency: "CAD" };
  }

  return undefined;
}

export function extractTaxAmount(text: string): number | undefined {
  const match = text.match(/(?:tax|hst|gst|vat)\s*:?\s*(?:CAD|USD|EUR|GBP)?\s*[$€£]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i);
  return match ? parseAmountToken(match[1]) : undefined;
}

const INVOICE_LABEL = `(?:${ci("invoice")}|${ci("confirmation")}|${ci("booking")}|${ci("reservation")}|${ci("folio")}|${ci("agreement")}|${ci("order")})`;
const INVOICE_SUFFIX = `(?:#|${ci("number")}|${ci("no")}\\.?|${ci("ref")}(?:${ci("erence")})?)?`;

// Hotel PMS systems (e.g. Marriott folios) commonly print an account or
// membership/confirmation number under labels like "ACCT#" or "MBV#:"
// rather than the word "invoice"/"confirmation" - checked first since these
// are more reliable identifiers than whatever capitalized word happens to
// follow a generic label.
const ACCOUNT_LABEL = `(?:${ci("acct")}|${ci("mbv")}|${ci("conf")}(?:${ci("irmation")})?)`;

export function extractInvoiceNumber(text: string): string | undefined {
  // Try every ACCT#/MBV#/CONF# occurrence, not just the first - a document
  // can have more than one such label. The captured value is numeric-only
  // (digits/hyphens) rather than allowing letters: these account/membership
  // numbers are conventionally numeric, and allowing letters risked the
  // capture swallowing the NEXT label's own text (e.g. "ACCT#" with no
  // number right after it capturing the literal word "MBV" from the
  // following "MBV#: 282635734" label, hiding that real number entirely).
  const acctRegex = new RegExp(`${ACCOUNT_LABEL}\\s*#\\s*:?\\s*(\\d[\\d-]{2,19})`, "g");
  for (const match of text.matchAll(acctRegex)) {
    return sanitize(match[1], 24);
  }

  // The code capture is intentionally case-sensitive (uppercase letters or
  // digits only) - real invoice/confirmation codes are conventionally
  // uppercase, and this is what excludes ordinary lowercase prose
  // (e.g. the label word itself, or unrelated sentence text) from matching.
  // Requires at least one digit in the captured code - without this, an
  // all-letter proper noun immediately following the label (e.g. a hotel
  // name right after the word "INVOICE" in a bilingual header) would be
  // captured as if it were the invoice number.
  const regex = new RegExp(`${INVOICE_LABEL}\\s*${INVOICE_SUFFIX}\\s*:?\\s*#?\\s*([A-Z0-9][A-Z0-9-]{3,20})`, "g");
  for (const match of text.matchAll(regex)) {
    if (/\d/.test(match[1])) {
      return sanitize(match[1].toUpperCase(), 24);
    }
  }
  return undefined;
}

export { extractCardLast4 };

const MONTH_NAMES = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

function parseDateToken(token: string): Date | undefined {
  const parsed = new Date(token);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

// Matches "Jan 14, 2026", "2026-01-14", "1/14/2026", and "04/14/26" (2-digit
// year, common on real hotel folios - Marriott's bilingual PMS template
// prints dates this way, and JS's Date constructor correctly interprets a
// 2-digit year like "26" as 2026 here).
const DATE_FORMATS = `(?:${MONTH_NAMES})\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{2,4}`;

// Looks for a date within a short window of characters on either side of
// the label, rather than assuming "label then date" order. Real PDF-to-text
// extraction doesn't always preserve visual left-to-right/top-to-bottom
// reading order for tables - Marriott's folio template, for example,
// renders each value immediately BEFORE its column label (e.g. "04/14/26\n
// DEPART" rather than "DEPART: 04/14/26"), which a strict "label then date"
// regex would never match, and worse, could grab a neighboring unrelated
// date instead (see fieldExtraction.test.ts for the real-world case this
// was fixed against).
const DATE_LABEL_WINDOW = 30;

// Three-tier date/label matching, in priority order:
//
// 1. Classic "Label: date" with an explicit colon - unambiguous, so this is
//    tried first regardless of what else is nearby (handles e.g.
//    "Check-in: Jan 14, 2026 Check-out: Jan 16, 2026", where a purely
//    distance-based search would wrongly favor the closer-but-wrong date).
// 2. Reversed table layout: "value ... LABEL" with no colon, where a bit of
//    other label text (e.g. a French label sharing the line, like
//    "DÉPART/DEPART") may sit between the date and the target label. This
//    is what Marriott's folio PDF template uses - the column header renders
//    immediately AFTER its value, not before - see fieldExtraction.test.ts
//    for the real-world case this was fixed against.
// 3. General fallback: nearest date within a wider window, in either
//    direction, for anything not covered by the two precise cases above.
function findLabeledDate(text: string, label: string): Date | undefined {
  const forwardColon = new RegExp(`(?:${label})\\s*:\\s*(${DATE_FORMATS})`, "i");
  const fc = text.match(forwardColon);
  if (fc) return parseDateToken(fc[1]);

  const backwardAdjacent = new RegExp(`(${DATE_FORMATS})[^0-9]{0,15}(?:${label})\\b`, "i");
  const ba = text.match(backwardAdjacent);
  if (ba) return parseDateToken(ba[1]);

  const labelRe = new RegExp(label, "gi");
  const dateRe = new RegExp(DATE_FORMATS, "gi");

  const dates: { start: number; end: number; text: string }[] = [];
  let dm: RegExpExecArray | null;
  while ((dm = dateRe.exec(text)) !== null) {
    dates.push({ start: dm.index, end: dateRe.lastIndex, text: dm[0] });
  }
  if (dates.length === 0) return undefined;

  let best: { distance: number; text: string } | undefined;
  let lm: RegExpExecArray | null;
  while ((lm = labelRe.exec(text)) !== null) {
    const labelStart = lm.index;
    const labelEnd = labelRe.lastIndex;
    for (const d of dates) {
      const distance = d.start >= labelEnd ? d.start - labelEnd : labelStart >= d.end ? labelStart - d.end : 0;
      if (distance <= DATE_LABEL_WINDOW && (!best || distance < best.distance)) {
        best = { distance, text: d.text };
      }
    }
  }
  return best ? parseDateToken(best.text) : undefined;
}

export function extractHotelDates(text: string): { checkIn?: Date; checkOut?: Date } {
  return {
    // "ARRIVE"/"DEPART" (not "arrival"/"departure") are the English labels
    // used by Marriott's bilingual folio template ("ARRIVÉE/ARRIVE",
    // "DÉPART/DEPART") - the ASCII English short forms are what we match on.
    checkIn: findLabeledDate(text, "check-in|checkin|arrival|arrive"),
    checkOut: findLabeledDate(text, "check-out|checkout|departure|depart"),
  };
}

export function extractServiceDate(text: string): Date | undefined {
  return (
    findLabeledDate(text, "service date|transaction date|travel date|trip date|rental date|date of service") ??
    findLabeledDate(text, "date")
  );
}

// A run of 1-5 capitalized words on the same line (no crossing newlines,
// bounded length) - intentionally case-sensitive: this is what
// distinguishes a proper noun (hotel/city/guest name) from ordinary prose.
// Must NOT be used inside a regex compiled with the `i` flag - see the `ci`
// helper above for how labels stay case-insensitive without that trap.
const CITY_CHAIN = "[A-Z][a-zA-Z]*(?:[ \\t]+[A-Z][a-zA-Z]*){0,4}";

export function extractRoute(text: string): string | undefined {
  const match = text.match(new RegExp(`(${CITY_CHAIN})[ \\t]*(?:->|→|\\bto\\b)[ \\t]*(${CITY_CHAIN})`));
  if (match) {
    return `${match[1].trim()} -> ${match[2].trim()}`;
  }
  return undefined;
}

// Captures a hotel brand/property name around the word "Marriott", e.g.
// "Courtyard by Marriott Toronto Downtown" or "Marriott Downtown Ottawa".
export function extractHotelName(text: string): string | undefined {
  const match = text.match(new RegExp(`(?:${CITY_CHAIN}[ \\t]+)?${ci("marriott")}(?:[ \\t]+${CITY_CHAIN})?`));
  return match ? sanitize(match[0]) : undefined;
}

export function extractHotelCity(text: string): string | undefined {
  const match = text.match(new RegExp(`(?:${ci("city")}|${ci("location")})[ \\t]*:?[ \\t]*(${CITY_CHAIN})`));
  return match ? sanitize(match[1], 40) : undefined;
}

export function extractGuestName(text: string): string | undefined {
  const match = text.match(new RegExp(`${ci("guest")}(?:[ \\t]*${ci("name")})?[ \\t]*:?[ \\t]*(${CITY_CHAIN})`));
  return match ? sanitize(match[1], 60) : undefined;
}

// Uber pickup/drop-off location fields are intentionally NOT populated
// here - they used to be extracted unconditionally for every email
// regardless of category, which corrupted non-Uber expenses (e.g. a hotel
// invoice's "Dorval, QC" address line being misread as an Uber pickup
// city). sync.ts calls extractUberTripLocations() directly, only when
// category === "GROUND_TRANSPORTATION_UBER".
export function extractAllFields(text: string): ExtractedFields {
  const amount = extractAmount(text);
  const hotelDates = extractHotelDates(text);
  return {
    amount: amount?.amount,
    currency: amount?.currency,
    taxAmount: extractTaxAmount(text),
    invoiceNumber: extractInvoiceNumber(text),
    cardLast4: extractCardLast4(text.toLowerCase()) ?? undefined,
    tripRoute: extractRoute(text),
    hotelCheckIn: hotelDates.checkIn,
    hotelCheckOut: hotelDates.checkOut,
    hotelName: extractHotelName(text),
    hotelCity: extractHotelCity(text),
    guestName: extractGuestName(text),
    serviceDate: extractServiceDate(text),
  };
}
