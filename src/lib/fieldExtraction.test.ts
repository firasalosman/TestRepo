import { describe, expect, it } from "vitest";
import {
  extractAmount,
  extractHotelDates,
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
