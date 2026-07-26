import { describe, expect, it } from "vitest";
import {
  applyAmountOverride,
  applyAmountRevert,
  applyParsedAmountUpdate,
  effectiveAmountOf,
  LOCAL_USER_ID,
  normalizeAmountInput,
  validateAmountInput,
} from "./amountOverride";

describe("normalizeAmountInput", () => {
  it("strips currency codes, symbols, commas, and whitespace", () => {
    expect(normalizeAmountInput("CAD 1,234.56")).toBe("1234.56");
    expect(normalizeAmountInput("$1,234.56")).toBe("1234.56");
    expect(normalizeAmountInput("  84.20  ")).toBe("84.20");
    expect(normalizeAmountInput("€99.00")).toBe("99.00");
  });
});

describe("validateAmountInput", () => {
  it("accepts a plain decimal", () => {
    expect(validateAmountInput("84.20")).toEqual({ valid: true, amount: 84.2 });
  });

  it("accepts CAD 1,234.56-style input", () => {
    expect(validateAmountInput("CAD 1,234.56")).toEqual({ valid: true, amount: 1234.56 });
  });

  it("accepts an integer with no decimal part", () => {
    expect(validateAmountInput("100")).toEqual({ valid: true, amount: 100 });
  });

  it("rejects invalid text", () => {
    const result = validateAmountInput("not a number");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/valid amount/i);
  });

  it("rejects more than 2 decimal places", () => {
    const result = validateAmountInput("12.345");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/2 decimal places/i);
  });

  it("rejects negative amounts by default", () => {
    const result = validateAmountInput("-50.00");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/negative/i);
  });

  it("allows negative amounts when explicitly enabled", () => {
    expect(validateAmountInput("-50.00", { allowNegative: true })).toEqual({ valid: true, amount: -50 });
  });

  it("requires confirmation for a zero amount", () => {
    const result = validateAmountInput("0");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.requiresZeroConfirmation).toBe(true);
      expect(result.error).toMatch(/\$0\.00/);
    }
  });

  it("accepts a zero amount when confirmed", () => {
    expect(validateAmountInput("0", { confirmZero: true })).toEqual({ valid: true, amount: 0 });
  });

  it("rounds to 2 decimal places", () => {
    expect(validateAmountInput("10.1")).toEqual({ valid: true, amount: 10.1 });
  });
});

describe("applyAmountOverride", () => {
  it("builds an override patch with defaults", () => {
    const now = new Date("2026-07-26T12:00:00Z");
    const patch = applyAmountOverride(42.5, "INLINE_LIST_EDIT", LOCAL_USER_ID, now);
    expect(patch).toEqual({
      effectiveAmount: 42.5,
      amountManuallyOverridden: true,
      amountOverrideTimestamp: now,
      amountOverrideSource: "INLINE_LIST_EDIT",
      amountOverrideUser: LOCAL_USER_ID,
    });
  });
});

describe("applyAmountRevert", () => {
  it("builds a patch that clears the override", () => {
    expect(applyAmountRevert()).toEqual({
      effectiveAmount: null,
      amountManuallyOverridden: false,
      amountOverrideTimestamp: null,
      amountOverrideSource: null,
      amountOverrideUser: null,
    });
  });
});

describe("effectiveAmountOf", () => {
  it("prefers effectiveAmount when set", () => {
    expect(effectiveAmountOf({ amount: 100, effectiveAmount: 50 })).toBe(50);
  });

  it("falls back to amount when effectiveAmount is null/undefined", () => {
    expect(effectiveAmountOf({ amount: 100, effectiveAmount: null })).toBe(100);
    expect(effectiveAmountOf({ amount: 100 })).toBe(100);
  });
});

describe("applyParsedAmountUpdate (reparse-protection guard)", () => {
  it("updates amount and clears effectiveAmount when there was no override", () => {
    const expense = { amount: 100, effectiveAmount: null, amountManuallyOverridden: false };
    expect(applyParsedAmountUpdate(expense, 120)).toEqual({ amount: 120, effectiveAmount: null });
  });

  it("updates the parsed amount but preserves a manual override", () => {
    const expense = { amount: 100, effectiveAmount: 75, amountManuallyOverridden: true };
    expect(applyParsedAmountUpdate(expense, 120)).toEqual({ amount: 120, effectiveAmount: 75 });
  });
});
