"use client";

import { useState } from "react";
import type { SerializedExpense } from "@/lib/data";
import { ALREADY_DECIDED_STATUSES } from "@/lib/types";
import type { BulkActionType, ExpenseCategory } from "@/lib/types";
import { groupTotalsByCurrency, hasMixedStatuses } from "@/lib/bulkActions";
import { CATEGORY_LABELS, MONTH_NAMES, STATUS_LABELS, formatMoney } from "@/lib/format";

const CATEGORIES = Object.keys(CATEGORY_LABELS);

const ACTION_LABELS: Record<BulkActionType, string> = {
  APPROVE: "Approve selected",
  REJECT: "Reject selected",
  MARK_PERSONAL: "Mark as personal",
  MARK_DUPLICATE: "Mark as duplicate",
  CHANGE_CATEGORY: "Change category",
  CHANGE_MONTH: "Change month",
};

interface BulkResult {
  updated: string[];
  skipped: { id: string; reason: string }[];
}

export default function BulkActionToolbar({
  selectedExpenses,
  onClear,
  onDone,
}: {
  selectedExpenses: SerializedExpense[];
  onClear: () => void;
  onDone: () => void;
}) {
  const [confirmingAction, setConfirmingAction] = useState<BulkActionType | null>(null);
  const [category, setCategory] = useState<ExpenseCategory>("OTHER_POTENTIAL");
  const [month, setMonth] = useState(1);
  const [reason, setReason] = useState("");
  const [overrideExistingStatuses, setOverrideExistingStatuses] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<BulkResult | null>(null);

  const totalsByCurrency = groupTotalsByCurrency(selectedExpenses);
  const mixedStatuses = hasMixedStatuses(selectedExpenses);
  const anyAlreadyDecided = selectedExpenses.some((e) => ALREADY_DECIDED_STATUSES.includes(e.status));

  function openConfirm(action: BulkActionType) {
    setLastResult(null);
    setOverrideExistingStatuses(false);
    setConfirmingAction(action);
  }

  async function applyAction() {
    if (!confirmingAction || busy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        action: confirmingAction,
        expenseIds: selectedExpenses.map((e) => e.id),
        overrideExistingStatuses,
      };
      if (confirmingAction === "REJECT" && reason) body.reason = reason;
      if (confirmingAction === "CHANGE_CATEGORY") body.category = category;
      if (confirmingAction === "CHANGE_MONTH") body.month = month;

      const res = await fetch("/api/expenses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result: BulkResult = await res.json();

      if (!res.ok && result.updated?.length === 0) {
        setLastResult(result);
        return;
      }

      setConfirmingAction(null);
      setReason("");
      if (result.skipped.length > 0) {
        alert(
          `${result.updated.length} updated, ${result.skipped.length} skipped:\n` +
            result.skipped.map((s) => `- ${s.id}: ${s.reason}`).join("\n"),
        );
      }
      onDone();
    } catch {
      alert("Bulk action failed. See server logs.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="card no-print"
      style={{
        position: "sticky",
        top: 8,
        zIndex: 10,
        marginBottom: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        border: "1px solid var(--accent)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <strong>{selectedExpenses.length} selected</strong>
        {Object.entries(totalsByCurrency).map(([currency, total]) => (
          <span key={currency} className="muted" style={{ fontSize: 13 }}>
            {formatMoney(total, currency)}
          </span>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => openConfirm("APPROVE")}>Approve selected</button>
        <button onClick={() => openConfirm("REJECT")}>Reject selected</button>
        <button onClick={() => openConfirm("MARK_PERSONAL")}>Mark as personal</button>
        <button onClick={() => openConfirm("MARK_DUPLICATE")}>Mark as duplicate</button>
        <button onClick={() => openConfirm("CHANGE_CATEGORY")}>Change category</button>
        <button onClick={() => openConfirm("CHANGE_MONTH")}>Change month</button>
        <button onClick={onClear}>Clear selection</button>
      </div>

      {confirmingAction && (
        <div className="card" style={{ background: "var(--bg)" }}>
          <h3 style={{ marginTop: 0 }}>{ACTION_LABELS[confirmingAction]}</h3>
          <p>
            This will apply to <strong>{selectedExpenses.length}</strong> claim
            {selectedExpenses.length === 1 ? "" : "s"}.
          </p>
          <div style={{ marginBottom: 8 }}>
            {Object.entries(totalsByCurrency).map(([currency, total]) => (
              <div key={currency}>
                Combined total ({currency}): <strong>{formatMoney(total, currency)}</strong>
              </div>
            ))}
          </div>

          {mixedStatuses && (
            <p style={{ color: "var(--warn)" }}>
              Warning: selected claims have mixed statuses ({[...new Set(selectedExpenses.map((e) => STATUS_LABELS[e.status]))].join(", ")}).
            </p>
          )}

          {anyAlreadyDecided && ["APPROVE", "REJECT", "MARK_PERSONAL", "MARK_DUPLICATE"].includes(confirmingAction) && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "var(--bad)" }}>
              <input
                type="checkbox"
                checked={overrideExistingStatuses}
                onChange={(e) => setOverrideExistingStatuses(e.target.checked)}
              />
              Some selected claims already have a manual decision (Rejected/Personal/Duplicate). Override them too?
            </label>
          )}

          {confirmingAction === "REJECT" && (
            <input
              placeholder="Rejection reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ width: "100%", marginBottom: 8 }}
            />
          )}

          {confirmingAction === "CHANGE_CATEGORY" && (
            <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} style={{ marginBottom: 8 }}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          )}

          {confirmingAction === "CHANGE_MONTH" && (
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ marginBottom: 8 }}>
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          )}

          {lastResult && (
            <p style={{ color: "var(--bad)" }}>
              Nothing eligible: {lastResult.skipped.map((s) => s.reason).join(" ")}
            </p>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={applyAction} disabled={busy}>
              {busy ? "Applying..." : "Confirm"}
            </button>
            <button onClick={() => setConfirmingAction(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
