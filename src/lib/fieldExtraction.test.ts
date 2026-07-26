import { describe, expect, it } from "vitest";
import {
  extractAmount,
  extractGuestName,
  extractHotelCity,
  extractHotelDates,
  extractHotelName,
  extractInvoiceNumber,
  extractRoute,
  extractTaxAmount,
} from "./fieldExtraction";

describe("extractAmount", () => {
  it("extracts a labeled total with currency code and symbol", () => {
    expect(extractAmount("Total paid: CAD $612.40")).toEqual({ amount: 612.4, currency: "CAD" });
  });

  it("extracts a plain dollar amount when no label is present", () => {
    expect(extractAmount("Thank you for your purchase. $84.20")).toEqual({ amount: 84.2, currency: "USD" });
  });

  it("handles thousands separators", () => {
    expect(extractAmount("Amount due: $1,240.00")).toEqual({ amount: 1240, currency: "USD" });
  });

  it("returns undefined when no amount is present", () => {
    expect(extractAmount("Thanks for flying with us!")).toBeUndefined();
  });
});

describe("extractTaxAmount", () => {
  it("extracts HST", () => {
    expect(extractTaxAmount("Subtotal $540.00 HST: $72.40 Total $612.40")).toBe(72.4);
  });
});

describe("extractInvoiceNumber", () => {
  it("extracts an invoice number", () => {
    expect(extractInvoiceNumber("Invoice #FOLIO-88213 dated Jan 16")).toBe("FOLIO-88213");
  });

  it("extracts a confirmation number", () => {
    expect(extractInvoiceNumber("Your confirmation number: CONF-88213")).toBe("CONF-88213");
  });
});

describe("extractHotelDates", () => {
  it("extracts check-in and check-out dates", () => {
    const result = extractHotelDates("Check-in: Jan 14, 2026 Check-out: Jan 16, 2026");
    expect(result.checkIn?.getUTCMonth()).toBe(0);
    expect(result.checkIn?.getUTCDate()).toBe(14);
    expect(result.checkOut?.getUTCDate()).toBe(16);
  });
});

describe("extractRoute", () => {
  it("extracts a route using 'to'", () => {
    expect(extractRoute("Your trip Toronto to Ottawa")).toBe("Toronto -> Ottawa");
  });

  it("extracts a route using an arrow", () => {
    expect(extractRoute("Toronto -> Montreal")).toBe("Toronto -> Montreal");
  });
});

// Regression tests for a real production bug: these regexes were compiled
// with the `i` (case-insensitive) flag while relying on [A-Z] elsewhere in
// the same pattern to mean "looks like a proper noun/code" - the `i` flag
// made [A-Z] match lowercase too, so real (non-mock) email text produced
// garbage like guestName "s per room" and hotelCity "We".
describe("case-insensitive-flag regression (garbage extraction from real email text)", () => {
  const REAL_MARRIOTT_EMAIL = `
Reservation Confirmation #99622258 for JW Marriott Orlando Bonnet Creek Resort & Spa

Thank you for your reservation. Guests per room, tax and fees not included in room rate.
We look forward to welcoming you.
`;

  it("does not extract a nonsense guest name from unrelated 'Guests per room' text", () => {
    const result = extractGuestName(REAL_MARRIOTT_EMAIL);
    expect(result).not.toBe("s per room");
    expect(result).toBeUndefined();
  });

  it("does not extract a nonsense hotel city from unrelated lowercase prose", () => {
    const result = extractHotelCity(REAL_MARRIOTT_EMAIL);
    expect(result).not.toBe("We");
    expect(result).toBeUndefined();
  });

  it("does not let the hotel name span multiple lines or include lowercase lead-in words", () => {
    const result = extractHotelName(REAL_MARRIOTT_EMAIL);
    expect(result).toBeDefined();
    expect(result).not.toContain("\n");
    expect(result?.startsWith("for")).toBe(false);
  });

  it("still extracts a real guest name when clearly labeled", () => {
    expect(extractGuestName("Guest Name: John Smith")).toBe("John Smith");
    expect(extractGuestName("guest: Jane Doe")).toBe("Jane Doe");
  });

  it("still extracts a real hotel city when clearly labeled", () => {
    expect(extractHotelCity("City: Orlando")).toBe("Orlando");
  });

  it("does not capture the label word itself as an invoice number", () => {
    // "CONFIRMATION" alone (no code/number following) must not be captured.
    expect(extractInvoiceNumber("Reservation Confirmation for your upcoming stay")).toBeUndefined();
  });

  it("still extracts a real confirmation number adjacent to '#'", () => {
    expect(extractInvoiceNumber("Reservation Confirmation #99622258 for JW Marriott")).toBe("99622258");
  });
});
