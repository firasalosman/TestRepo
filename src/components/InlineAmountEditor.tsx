"use client";

import { useEffect, useRef, useState } from "react";
import type { SerializedExpense } from "@/lib/data";
import { formatMoney } from "@/lib/format";

// Inline, click-to-edit amount cell used in the expense list (and any other
// review queue rendering an ExpenseRow). Saves a manual override via
// PATCH /api/expenses/[id]/amount without expanding the row. Kept isolated
// from ExpenseTable's own state so a pending edit's save/cancel lifecycle
// doesn't get tangled up with row expand/select handling.
export default function InlineAmountEditor({
  expense: e,
  onSaved,
  onEditingChange,
  note,
}: {
  expense: SerializedExpense;
  onSaved: () => void;
  onEditingChange?: (editing: boolean) => void;
  note?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(e.effectiveAmount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresZeroConfirmation, setRequiresZeroConfirmation] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEditing() {
    setValue(String(e.effectiveAmount));
    setError(null);
    setRequiresZeroConfirmation(false);
    setConflict(false);
    setEditing(true);
    onEditingChange?.(true);
  }

  function stopEditing() {
    setEditing(false);
    setError(null);
    setRequiresZeroConfirmation(false);
    setConflict(false);
    onEditingChange?.(false);
    // Return focus to the amount cell for accessibility after save/cancel.
    requestAnimationFrame(() => cellRef.current?.focus());
  }

  function cancel() {
    stopEditing();
  }

  async function save(confirmZero = false) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/expenses/${e.id}/amount`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: value,
          expectedVersion: e.version,
          source: "INLINE_LIST_EDIT",
          confirmZero,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setConflict(true);
        setAnnouncement("This expense was changed elsewhere. Reload the latest value and try again.");
        return;
      }

      if (!res.ok) {
        if (body.requiresZeroConfirmation) {
          setRequiresZeroConfirmation(true);
        }
        setError(body.error ?? "Failed to save amount.");
        setAnnouncement(body.error ?? "Failed to save amount.");
        return;
      }

      setAnnouncement("Amount saved.");
      stopEditing();
      onSaved();
    } catch {
      setError("Failed to save amount. Check your connection and try again.");
      setAnnouncement("Failed to save amount.");
    } finally {
      setSaving(false);
    }
  }

  async function revert() {
    if (saving) return;
    if (!window.confirm("Revert to the originally parsed amount? This will change the total.")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/expenses/${e.id}/amount`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revert: true, expectedVersion: e.version, source: "REVERT" }),
      });
      if (res.status === 409) {
        setConflict(true);
        setAnnouncement("This expense was changed elsewhere. Reload the latest value and try again.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to revert amount.");
        return;
      }
      setAnnouncement("Reverted to parsed amount.");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      save();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      cancel();
    } else if (ev.key === "Tab") {
      // Let the default focus move happen; just trigger the save alongside it.
      save();
    }
  }

  if (conflict) {
    return (
      <td onClick={(ev) => ev.stopPropagation()}>
        <div role="alert" style={{ color: "var(--bad)", fontSize: 12 }}>
          Changed elsewhere.{" "}
          <button
            onClick={() => {
              onSaved();
              stopEditing();
            }}
          >
            Reload latest
          </button>
        </div>
        <span aria-live="polite" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
          {announcement}
        </span>
      </td>
    );
  }

  if (!editing) {
    return (
      <td onClick={(ev) => ev.stopPropagation()}>
        <div
          ref={cellRef}
          tabIndex={0}
          role="button"
          aria-label={
            e.amountManuallyOverridden
              ? `${formatMoney(e.effectiveAmount, e.currency)}, manually corrected from ${formatMoney(e.parsedAmount, e.currency)}${
                  e.amountOverrideTimestamp ? ` on ${new Date(e.amountOverrideTimestamp).toLocaleDateString()}` : ""
                }. Press Enter to edit.`
              : `${formatMoney(e.effectiveAmount, e.currency)}. Press Enter to edit.`
          }
          title={
            e.amountManuallyOverridden
              ? `Manually corrected — original parsed amount ${formatMoney(e.parsedAmount, e.currency)}${
                  e.amountOverrideTimestamp ? ` on ${new Date(e.amountOverrideTimestamp).toLocaleDateString()}` : ""
                }`
              : undefined
          }
          onClick={startEditing}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              startEditing();
            }
          }}
          style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          {formatMoney(e.effectiveAmount, e.currency)}
          {e.amountManuallyOverridden && (
            <span aria-hidden style={{ fontSize: 11, border: "1px solid var(--text-dim)", borderRadius: 3, padding: "0 3px" }}>
              edited
            </span>
          )}
        </div>
        {note && <div className="muted" style={{ fontSize: 11 }}>{note}</div>}
      </td>
    );
  }

  return (
    <td onClick={(ev) => ev.stopPropagation()}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span className="muted" style={{ fontSize: 12 }}>{e.currency}</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={value}
            aria-label={`Edit amount, currently ${formatMoney(e.effectiveAmount, e.currency)}`}
            aria-invalid={Boolean(error)}
            onChange={(ev) => setValue(ev.target.value)}
            onKeyDown={onKeyDown}
            disabled={saving}
            style={{ width: 90 }}
          />
          <button onClick={() => save()} disabled={saving} aria-label="Save amount">
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={cancel} disabled={saving} aria-label="Cancel editing amount">
            Cancel
          </button>
        </div>
        {error && (
          <div role="alert" style={{ color: "var(--bad)", fontSize: 12 }}>
            {error}
            {requiresZeroConfirmation && (
              <button style={{ marginLeft: 6 }} onClick={() => save(true)} disabled={saving}>
                Confirm $0.00
              </button>
            )}
          </div>
        )}
        {e.amountManuallyOverridden && !error && (
          <button
            onClick={revert}
            disabled={saving}
            style={{ fontSize: 12, alignSelf: "flex-start" }}
            title={`Original parsed amount: ${formatMoney(e.parsedAmount, e.currency)}`}
          >
            Revert to parsed amount
          </button>
        )}
        <span aria-live="polite" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
          {announcement}
        </span>
      </div>
    </td>
  );
}
