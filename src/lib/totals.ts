// Pure aggregation functions for monthly tiles and the yearly summary.
// Only CONFIRMED expenses count toward the "confirmed" totals; everything
// else (except REJECTED/PERSONAL/DUPLICATE) rolls into a separate
// "potential" total so the UI can show both without double-counting.

import type { ExpenseCategory, TotalableExpense } from "./types";

export interface MonthlyTotal {
  month: number;
  confirmedTotal: number;
  potentialTotal: number;
  expenseCount: number;
  needsReviewCount: number;
  allReviewed: boolean;
}

// A manual amount override always takes priority, even over automatic
// currency conversion - see src/lib/amountOverride.ts.
function amountOf(e: TotalableExpense): number {
  return e.effectiveAmount ?? e.convertedAmount ?? e.amount;
}

export function computeMonthlyTotals(expenses: TotalableExpense[]): MonthlyTotal[] {
  const months: MonthlyTotal[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    confirmedTotal: 0,
    potentialTotal: 0,
    expenseCount: 0,
    needsReviewCount: 0,
    allReviewed: true,
  }));

  for (const e of expenses) {
    if (e.status === "DUPLICATE" || e.status === "REJECTED" || e.status === "PERSONAL") {
      continue;
    }
    const bucket = months[e.month - 1];
    if (!bucket) continue;

    bucket.expenseCount += 1;
    if (e.status === "CONFIRMED") {
      bucket.confirmedTotal += amountOf(e);
    }
    if (e.status === "CONFIRMED" || e.status === "NEEDS_REVIEW") {
      bucket.potentialTotal += amountOf(e);
    }
    if (e.status === "NEEDS_REVIEW") {
      bucket.needsReviewCount += 1;
      bucket.allReviewed = false;
    }
  }

  return months;
}

export interface YearlySummary {
  totalConfirmed: number;
  totalPotential: number;
  byMonth: MonthlyTotal[];
  byCategory: Record<ExpenseCategory, number>;
  byVendor: Record<string, number>;
  needsReviewCount: number;
  missingOrUnclearAmountCount: number;
}

const ALL_CATEGORIES: ExpenseCategory[] = [
  "HOTEL",
  "CAR_RENTAL",
  "TORONTO_CONDO_RENTAL",
  "GROUND_TRANSPORTATION_UBER",
  "RAIL_TRANSPORTATION",
  "OTHER_POTENTIAL",
];

export function computeYearlySummary(expenses: TotalableExpense[]): YearlySummary {
  const byMonth = computeMonthlyTotals(expenses);

  const byCategory = Object.fromEntries(ALL_CATEGORIES.map((c) => [c, 0])) as Record<
    ExpenseCategory,
    number
  >;
  const byVendor: Record<string, number> = {};

  let totalConfirmed = 0;
  let totalPotential = 0;
  let needsReviewCount = 0;
  let missingOrUnclearAmountCount = 0;

  for (const e of expenses) {
    if (e.status === "DUPLICATE" || e.status === "REJECTED" || e.status === "PERSONAL") {
      if (!e.amount || e.amount <= 0) missingOrUnclearAmountCount += 0; // excluded categories don't count
      continue;
    }

    if (!e.amount || e.amount <= 0) {
      missingOrUnclearAmountCount += 1;
    }

    if (e.status === "NEEDS_REVIEW") {
      needsReviewCount += 1;
    }

    const amt = amountOf(e);
    if (e.status === "CONFIRMED") {
      totalConfirmed += amt;
      byCategory[e.category] += amt;
      byVendor[e.vendor] = (byVendor[e.vendor] ?? 0) + amt;
    }
    if (e.status === "CONFIRMED" || e.status === "NEEDS_REVIEW") {
      totalPotential += amt;
    }
  }

  return {
    totalConfirmed,
    totalPotential,
    byMonth,
    byCategory,
    byVendor,
    needsReviewCount,
    missingOrUnclearAmountCount,
  };
}
