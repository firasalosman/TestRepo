// Pure logic for bulk review actions - eligibility, currency-grouped totals
// for the confirmation dialog, and the before/after diff recorded in the
// audit trail. Kept independent of Prisma so it's trivial to unit test; the
// API route (src/app/api/expenses/bulk/route.ts) wires this up to the DB
// inside a single transaction.

import { ALREADY_DECIDED_STATUSES } from "./types";
import type { BulkActionType, BulkEligibilityInput, BulkSkipped, ExpenseStatus } from "./types";

const STATUS_CHANGING_ACTIONS: BulkActionType[] = ["APPROVE", "REJECT", "MARK_PERSONAL", "MARK_DUPLICATE"];

// Only status-changing actions can conflict with a prior manual decision;
// category/month changes don't touch status and are always eligible.
export function isStatusChangingAction(action: BulkActionType): boolean {
  return STATUS_CHANGING_ACTIONS.includes(action);
}

export function targetStatusForAction(action: BulkActionType): ExpenseStatus | null {
  switch (action) {
    case "APPROVE":
      return "CONFIRMED";
    case "REJECT":
      return "REJECTED";
    case "MARK_PERSONAL":
      return "PERSONAL";
    case "MARK_DUPLICATE":
      return "DUPLICATE";
    default:
      return null; // CHANGE_CATEGORY / CHANGE_MONTH don't set status
  }
}

export interface EligibilityResult {
  eligibleIds: string[];
  skipped: BulkSkipped[];
}

// Determines which selected expenses a bulk action may actually apply to.
// Status-changing actions skip rows that already carry a prior manual
// decision (Rejected/Personal/Duplicate) unless overrideExistingStatuses is
// explicitly set - this is the server-side re-validation the UI's own
// filtering must not be trusted to enforce alone.
export function computeEligibility(
  expenses: BulkEligibilityInput[],
  action: BulkActionType,
  overrideExistingStatuses: boolean,
): EligibilityResult {
  const eligibleIds: string[] = [];
  const skipped: BulkSkipped[] = [];

  for (const e of expenses) {
    if (isStatusChangingAction(action) && ALREADY_DECIDED_STATUSES.includes(e.status) && !overrideExistingStatuses) {
      skipped.push({ id: e.id, reason: `Already ${e.status}; requires override to change.` });
      continue;
    }
    eligibleIds.push(e.id);
  }

  return { eligibleIds, skipped };
}

// True when the selected set mixes more than one status - used to show a
// "mixed statuses" warning before a bulk action is confirmed.
export function hasMixedStatuses(expenses: BulkEligibilityInput[]): boolean {
  return new Set(expenses.map((e) => e.status)).size > 1;
}

export interface AmountLike {
  amount: number;
  currency: string;
}

// Combined selected total, grouped by currency so different currencies are
// never silently summed into one misleading number.
export function groupTotalsByCurrency(expenses: AmountLike[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of expenses) {
    totals[e.currency] = (totals[e.currency] ?? 0) + e.amount;
  }
  return totals;
}

// Builds the { previousValues, newValues } pair recorded in AuditLog,
// including only the fields that actually changed.
export function buildFieldDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { previousValues: Record<string, unknown>; newValues: Record<string, unknown> } {
  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      previousValues[key] = before[key];
      newValues[key] = after[key];
    }
  }

  return { previousValues, newValues };
}
