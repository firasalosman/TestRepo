// Manual amount override: parsing/validation for the inline amount editor,
// plus the override/revert/reparse-guard logic that decides what
// `effectiveAmount` (the field totals/export/bulk-selection all read)
// should be. Kept as pure functions so they're unit-testable without a
// database - the API route (src/app/api/expenses/[id]/amount/route.ts)
// wires this up to Prisma inside a transaction.

export const LOCAL_USER_ID = "local-user";

const CURRENCY_WORD = /\b(CAD|USD|EUR|GBP)\b/gi;
const CURRENCY_SYMBOL = /[$€£]/g;

// Strips currency codes/symbols, commas, and surrounding whitespace so
// "CAD 1,234.56", "$1,234.56", and "1234.56" all normalize the same way.
export function normalizeAmountInput(raw: string): string {
  return raw.replace(CURRENCY_WORD, "").replace(CURRENCY_SYMBOL, "").replace(/,/g, "").trim();
}

function countDecimalPlaces(normalized: string): number {
  const dot = normalized.indexOf(".");
  return dot === -1 ? 0 : normalized.length - dot - 1;
}

export interface AmountValidationOptions {
  allowNegative?: boolean; // only true for expense types that explicitly support credits/refunds - none do today
  confirmZero?: boolean; // must be explicitly set true to accept a $0.00 amount
}

export type AmountValidationResult =
  | { valid: true; amount: number }
  | { valid: false; error: string; requiresZeroConfirmation?: boolean };

// Validates and parses user-typed amount text for the inline editor / the
// amount-override API route. Returns a specific, displayable error message
// for every rejection case rather than silently coercing bad input.
export function validateAmountInput(raw: string, options: AmountValidationOptions = {}): AmountValidationResult {
  const normalized = normalizeAmountInput(raw);

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return { valid: false, error: "Enter a valid amount, e.g. 1234.56 or CAD 1,234.56." };
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount)) {
    return { valid: false, error: "Enter a valid amount, e.g. 1234.56 or CAD 1,234.56." };
  }

  if (countDecimalPlaces(normalized) > 2) {
    return { valid: false, error: "Amounts can have at most 2 decimal places." };
  }

  if (amount < 0 && !options.allowNegative) {
    return { valid: false, error: "Negative amounts aren't supported for this expense type." };
  }

  if (amount === 0 && !options.confirmZero) {
    return {
      valid: false,
      error: "Confirm that this expense is really $0.00 before saving.",
      requiresZeroConfirmation: true,
    };
  }

  return { valid: true, amount: Math.round(amount * 100) / 100 };
}

export type AmountOverrideSource = "INLINE_LIST_EDIT" | "DETAIL_EDIT" | "REVERT";

export interface AmountOverridePatch {
  effectiveAmount: number | null;
  amountManuallyOverridden: boolean;
  amountOverrideTimestamp: Date | null;
  amountOverrideSource: string | null;
  amountOverrideUser: string | null;
}

// Builds the DB patch for applying a manual override.
export function applyAmountOverride(
  newAmount: number,
  source: AmountOverrideSource,
  user: string = LOCAL_USER_ID,
  now: Date = new Date(),
): AmountOverridePatch {
  return {
    effectiveAmount: newAmount,
    amountManuallyOverridden: true,
    amountOverrideTimestamp: now,
    amountOverrideSource: source,
    amountOverrideUser: user,
  };
}

// Builds the DB patch for clearing an override, falling back to the parsed
// amount (`amount`) again.
export function applyAmountRevert(): AmountOverridePatch {
  return {
    effectiveAmount: null,
    amountManuallyOverridden: false,
    amountOverrideTimestamp: null,
    amountOverrideSource: null,
    amountOverrideUser: null,
  };
}

export function effectiveAmountOf(expense: { amount: number; effectiveAmount?: number | null }): number {
  return expense.effectiveAmount ?? expense.amount;
}

// Contract for any future re-parse/re-sync path that updates an existing
// expense's parsed amount: the raw parsed amount (`amount`) always reflects
// the latest parse, but a manually overridden `effectiveAmount` must never
// be silently replaced. There is no live caller of this today (sync.ts only
// ever creates new expenses, never updates an existing one's amount), but
// this is the guard any future reparse feature must go through.
export function applyParsedAmountUpdate(
  expense: { amount: number; effectiveAmount: number | null; amountManuallyOverridden: boolean },
  newParsedAmount: number,
): { amount: number; effectiveAmount: number | null } {
  return {
    amount: newParsedAmount,
    effectiveAmount: expense.amountManuallyOverridden ? expense.effectiveAmount : null,
  };
}
