import { describe, expect, it } from "vitest";
import { attributeExpenseDate } from "./dateAttribution";

describe("attributeExpenseDate", () => {
  it("prefers the service date when available", () => {
    const result = attributeExpenseDate({
      category: "HOTEL",
      serviceDate: new Date("2026-03-05T00:00:00Z"),
      invoiceDate: new Date("2026-02-28T00:00:00Z"),
      receivedDate: new Date("2026-03-06T00:00:00Z"),
    });
    expect(result.month).toBe(3);
    expect(result.needsReview).toBe(false);
  });

  it("falls back to invoice date when service date is missing", () => {
    const result = attributeExpenseDate({
      category: "CAR_RENTAL",
      serviceDate: null,
      invoiceDate: new Date("2026-06-15T00:00:00Z"),
      receivedDate: new Date("2026-06-16T00:00:00Z"),
    });
    expect(result.month).toBe(6);
    expect(result.needsReview).toBe(false);
  });

  it("falls back to received date and flags review when both are missing", () => {
    const result = attributeExpenseDate({
      category: "OTHER_POTENTIAL",
      serviceDate: null,
      invoiceDate: null,
      receivedDate: new Date("2026-09-01T00:00:00Z"),
    });
    expect(result.month).toBe(9);
    expect(result.needsReview).toBe(true);
  });
});
