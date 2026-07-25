import { describe, expect, it } from "vitest";
import {
  buildFieldDiff,
  computeEligibility,
  groupTotalsByCurrency,
  hasMixedStatuses,
  isStatusChangingAction,
  targetStatusForAction,
} from "./bulkActions";

describe("targetStatusForAction / isStatusChangingAction", () => {
  it("maps status-changing actions to the correct stored status", () => {
    expect(targetStatusForAction("APPROVE")).toBe("CONFIRMED");
    expect(targetStatusForAction("REJECT")).toBe("REJECTED");
    expect(targetStatusForAction("MARK_PERSONAL")).toBe("PERSONAL");
    expect(targetStatusForAction("MARK_DUPLICATE")).toBe("DUPLICATE");
  });

  it("returns null for actions that don't set status", () => {
    expect(targetStatusForAction("CHANGE_CATEGORY")).toBeNull();
    expect(targetStatusForAction("CHANGE_MONTH")).toBeNull();
  });

  it("only treats status-changing actions as such", () => {
    expect(isStatusChangingAction("APPROVE")).toBe(true);
    expect(isStatusChangingAction("CHANGE_CATEGORY")).toBe(false);
    expect(isStatusChangingAction("CHANGE_MONTH")).toBe(false);
  });
});

describe("computeEligibility", () => {
  it("approves eligible NEEDS_REVIEW rows without needing an override", () => {
    const result = computeEligibility(
      [
        { id: "a", status: "NEEDS_REVIEW" },
        { id: "b", status: "CONFIRMED" },
      ],
      "APPROVE",
      false,
    );
    expect(result.eligibleIds).toEqual(["a", "b"]);
    expect(result.skipped).toHaveLength(0);
  });

  it("skips rows with a prior manual decision unless overridden", () => {
    const result = computeEligibility(
      [
        { id: "a", status: "NEEDS_REVIEW" },
        { id: "b", status: "REJECTED" },
        { id: "c", status: "PERSONAL" },
      ],
      "APPROVE",
      false,
    );
    expect(result.eligibleIds).toEqual(["a"]);
    expect(result.skipped).toEqual([
      { id: "b", reason: "Already REJECTED; requires override to change." },
      { id: "c", reason: "Already PERSONAL; requires override to change." },
    ]);
  });

  it("includes previously-decided rows when override is explicitly set", () => {
    const result = computeEligibility(
      [
        { id: "a", status: "REJECTED" },
        { id: "b", status: "DUPLICATE" },
      ],
      "REJECT",
      true,
    );
    expect(result.eligibleIds).toEqual(["a", "b"]);
    expect(result.skipped).toHaveLength(0);
  });

  it("never restricts CHANGE_CATEGORY / CHANGE_MONTH by prior status", () => {
    const result = computeEligibility(
      [
        { id: "a", status: "REJECTED" },
        { id: "b", status: "CONFIRMED" },
      ],
      "CHANGE_CATEGORY",
      false,
    );
    expect(result.eligibleIds).toEqual(["a", "b"]);
    expect(result.skipped).toHaveLength(0);
  });
});

describe("hasMixedStatuses", () => {
  it("detects a mixed-status selection", () => {
    expect(
      hasMixedStatuses([
        { id: "a", status: "NEEDS_REVIEW" },
        { id: "b", status: "CONFIRMED" },
      ]),
    ).toBe(true);
  });

  it("returns false for a uniform selection", () => {
    expect(
      hasMixedStatuses([
        { id: "a", status: "NEEDS_REVIEW" },
        { id: "b", status: "NEEDS_REVIEW" },
      ]),
    ).toBe(false);
  });
});

describe("groupTotalsByCurrency", () => {
  it("never combines different currencies into a single total", () => {
    const totals = groupTotalsByCurrency([
      { amount: 100, currency: "CAD" },
      { amount: 50, currency: "USD" },
      { amount: 25, currency: "CAD" },
    ]);
    expect(totals).toEqual({ CAD: 125, USD: 50 });
  });
});

describe("buildFieldDiff", () => {
  it("only includes fields that actually changed", () => {
    const diff = buildFieldDiff(
      { status: "NEEDS_REVIEW", category: "HOTEL", vendor: "Marriott" },
      { status: "CONFIRMED", category: "HOTEL" },
    );
    expect(diff.previousValues).toEqual({ status: "NEEDS_REVIEW" });
    expect(diff.newValues).toEqual({ status: "CONFIRMED" });
  });

  it("produces an empty diff when nothing changed", () => {
    const diff = buildFieldDiff({ status: "CONFIRMED" }, { status: "CONFIRMED" });
    expect(diff.previousValues).toEqual({});
    expect(diff.newValues).toEqual({});
  });
});
