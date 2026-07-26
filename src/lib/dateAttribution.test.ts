import { describe, expect, it } from "vitest";
import { attributeExpenseDate, inferHotelServiceDate } from "./dateAttribution";

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

describe("inferHotelServiceDate + hotel reservation month attribution", () => {
  it("assigns a hotel reservation to the check-out month, not the check-in month, when the stay spans a month boundary", () => {
    const checkIn = new Date("2026-01-31T00:00:00Z");
    const checkOut = new Date("2026-02-01T00:00:00Z");

    const inferred = inferHotelServiceDate(checkIn, checkOut);
    expect(inferred).toEqual(checkOut);

    const result = attributeExpenseDate({
      category: "HOTEL",
      serviceDate: inferred,
      invoiceDate: null,
      receivedDate: new Date("2026-01-25T00:00:00Z"),
    });
    expect(result.month).toBe(2);
    expect(result.needsReview).toBe(false);
  });

  it("falls back to check-in when check-out is unavailable", () => {
    const checkIn = new Date("2026-04-21T00:00:00Z");
    const inferred = inferHotelServiceDate(checkIn, undefined);
    expect(inferred).toEqual(checkIn);
  });

  it("returns null and flags review when neither check-in nor check-out is available", () => {
    const inferred = inferHotelServiceDate(null, null);
    expect(inferred).toBeNull();

    const result = attributeExpenseDate({
      category: "HOTEL",
      serviceDate: inferred,
      invoiceDate: null,
      receivedDate: new Date("2026-06-01T00:00:00Z"),
    });
    expect(result.needsReview).toBe(true);
  });
});
