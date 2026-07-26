import { describe, expect, it } from "vitest";
import { computeMonthlyTotals, computeYearlySummary } from "./totals";
import type { TotalableExpense } from "./types";

const expenses: TotalableExpense[] = [
  { id: "1", month: 1, category: "HOTEL", vendor: "Fairmont", status: "CONFIRMED", amount: 612.4, currency: "CAD" },
  { id: "2", month: 1, category: "HOTEL", vendor: "Fairmont", status: "DUPLICATE", amount: 640, currency: "CAD" },
  {
    id: "3",
    month: 1,
    category: "GROUND_TRANSPORTATION_UBER",
    vendor: "Uber",
    status: "CONFIRMED",
    amount: 38.42,
    currency: "CAD",
  },
  {
    id: "4",
    month: 2,
    category: "CAR_RENTAL",
    vendor: "Hertz",
    status: "NEEDS_REVIEW",
    amount: 214.87,
    currency: "CAD",
  },
  {
    id: "5",
    month: 2,
    category: "GROUND_TRANSPORTATION_UBER",
    vendor: "Uber",
    status: "PERSONAL",
    amount: 15.6,
    currency: "CAD",
  },
  {
    id: "6",
    month: 3,
    category: "HOTEL",
    vendor: "Unknown Hotel",
    status: "NEEDS_REVIEW",
    amount: 0,
    currency: "CAD",
  },
];

describe("computeMonthlyTotals", () => {
  it("only counts CONFIRMED expenses toward confirmedTotal and excludes duplicates/personal/rejected", () => {
    const totals = computeMonthlyTotals(expenses);
    const jan = totals[0];
    expect(jan.confirmedTotal).toBeCloseTo(612.4 + 38.42, 2);
    expect(jan.expenseCount).toBe(2); // duplicate excluded
    expect(jan.allReviewed).toBe(true);
  });

  it("includes NEEDS_REVIEW in potentialTotal but not confirmedTotal", () => {
    const totals = computeMonthlyTotals(expenses);
    const feb = totals[1];
    expect(feb.confirmedTotal).toBe(0);
    expect(feb.potentialTotal).toBeCloseTo(214.87, 2);
    expect(feb.needsReviewCount).toBe(1);
    expect(feb.allReviewed).toBe(false);
    expect(feb.expenseCount).toBe(1); // personal excluded
  });

  it("uses convertedAmount when present", () => {
    const totals = computeMonthlyTotals([
      {
        id: "x",
        month: 5,
        category: "OTHER_POTENTIAL",
        vendor: "LinkedIn",
        status: "CONFIRMED",
        amount: 59.99,
        convertedAmount: 82.1,
        currency: "USD",
      },
    ]);
    expect(totals[4].confirmedTotal).toBeCloseTo(82.1, 2);
  });

  it("uses effectiveAmount (manual override) over convertedAmount and amount", () => {
    const totals = computeMonthlyTotals([
      {
        id: "y",
        month: 6,
        category: "OTHER_POTENTIAL",
        vendor: "Adobe",
        status: "CONFIRMED",
        amount: 59.99,
        convertedAmount: 82.1,
        effectiveAmount: 50,
        currency: "USD",
      },
    ]);
    expect(totals[5].confirmedTotal).toBe(50);
  });
});

describe("computeYearlySummary", () => {
  it("aggregates totals by category and vendor, and counts missing amounts", () => {
    const summary = computeYearlySummary(expenses);
    expect(summary.totalConfirmed).toBeCloseTo(612.4 + 38.42, 2);
    expect(summary.byCategory.HOTEL).toBeCloseTo(612.4, 2);
    expect(summary.byVendor["Fairmont"]).toBeCloseTo(612.4, 2);
    expect(summary.needsReviewCount).toBe(2);
    expect(summary.missingOrUnclearAmountCount).toBe(1);
  });

  it("never double-counts a duplicate expense", () => {
    const summary = computeYearlySummary(expenses);
    // Only the primary Fairmont folio (612.40) should appear, not the 640 duplicate.
    expect(summary.byVendor["Fairmont"]).toBeCloseTo(612.4, 2);
  });
});

describe("hotel reservation confirmations stay out of confirmed totals until approved", () => {
  it("counts a Needs Review reservation confirmation toward potential, never confirmed, total", () => {
    const reservation: TotalableExpense = {
      id: "res-1",
      month: 4,
      category: "HOTEL",
      vendor: "Courtyard by Marriott Toronto Downtown",
      status: "NEEDS_REVIEW",
      amount: 342.5,
      currency: "CAD",
    };

    const monthly = computeMonthlyTotals([reservation]);
    expect(monthly[3].confirmedTotal).toBe(0);
    expect(monthly[3].potentialTotal).toBeCloseTo(342.5, 2);
    expect(monthly[3].needsReviewCount).toBe(1);

    const yearly = computeYearlySummary([reservation]);
    expect(yearly.totalConfirmed).toBe(0);
    expect(yearly.totalPotential).toBeCloseTo(342.5, 2);
    expect(yearly.byCategory.HOTEL).toBe(0);
  });

  it("only counts it toward the confirmed total after the user manually approves it", () => {
    const approved: TotalableExpense = {
      id: "res-1",
      month: 4,
      category: "HOTEL",
      vendor: "Courtyard by Marriott Toronto Downtown",
      status: "CONFIRMED", // user clicked Confirm
      amount: 342.5,
      currency: "CAD",
    };

    const monthly = computeMonthlyTotals([approved]);
    expect(monthly[3].confirmedTotal).toBeCloseTo(342.5, 2);

    const yearly = computeYearlySummary([approved]);
    expect(yearly.totalConfirmed).toBeCloseTo(342.5, 2);
  });
});
