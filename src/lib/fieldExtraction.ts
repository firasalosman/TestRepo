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

  return undefined;
}

export function extractTaxAmount(text: string): number | undefined {
  const match = text.match(/(?:tax|hst|gst|vat)\s*:?\s*(?:CAD|USD|EUR|GBP)?\s*[$€£]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i);
  return match ? parseAmountToken(match[1]) : undefined;
}

const INVOICE_LABEL = `(?:${ci("invoice")}|${ci("confirmation")}|${ci("booking")}|${ci("reservation")}|${ci("folio")}|${ci("agreement")}|${ci("order")})`;
const INVOICE_SUFFIX = `(?:#|${ci("number")}|${ci("no")}\\.?|${ci("ref")}(?:${ci("erence")})?)?`;

export function extractInvoiceNumber(text: string): string | undefined {
  // The code capture is intentionally case-sensitive (uppercase letters or
  // digits only) - real invoice/confirmation codes are conventionally
  // uppercase, and this is what excludes ordinary lowercase prose
  // (e.g. the label word itself, or unrelated sentence text) from matching.
  const match = text.match(new RegExp(`${INVOICE_LABEL}\\s*${INVOICE_SUFFIX}\\s*:?\\s*#?\\s*([A-Z0-9][A-Z0-9-]{3,20})`));
  return match ? sanitize(match[1], 24) : undefined;
}

export { extractCardLast4 };

const MONTH_NAMES = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

function parseDateToken(token: string): Date | undefined {
  const parsed = new Date(token);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function findLabeledDate(text: string, label: string): Date | undefined {
  const re = new RegExp(`(?:${label})\\s*:?\\s*((?:${MONTH_NAMES})\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{4})`, "i");
  const match = text.match(re);
  return match ? parseDateToken(match[1]) : undefined;
}

export function extractHotelDates(text: string): { checkIn?: Date; checkOut?: Date } {
  return {
    checkIn: findLabeledDate(text, "check-in|checkin|arrival"),
    checkOut: findLabeledDate(text, "check-out|checkout|departure"),
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
