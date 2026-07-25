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

export function extractInvoiceNumber(text: string): string | undefined {
  const match = text.match(
    /(?:invoice|confirmation|booking|reservation|folio|agreement|order)\s*(?:#|number|no\.?|ref(?:erence)?)?\s*:?\s*#?\s*([A-Z0-9][A-Z0-9-]{3,20})/i,
  );
  return match ? match[1].toUpperCase() : undefined;
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

const CITY_CHAIN = "[A-Z][a-zA-Z]*(?:\\s+[A-Z][a-zA-Z]*)*";

export function extractRoute(text: string): string | undefined {
  const match = text.match(new RegExp(`(${CITY_CHAIN})\\s*(?:->|→|\\bto\\b)\\s*(${CITY_CHAIN})`));
  if (match) {
    return `${match[1].trim()} -> ${match[2].trim()}`;
  }
  return undefined;
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
    serviceDate: extractServiceDate(text),
  };
}
