"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SerializedExpense } from "@/lib/data";
import type { ExpenseCategory } from "@/lib/types";
import { CATEGORY_LABELS, SOURCE_TYPE_LABELS, STATUS_LABELS, formatDate, formatMoney } from "@/lib/format";
import BulkActionToolbar from "./BulkActionToolbar";
import AuditHistory from "./AuditHistory";

const CATEGORIES = Object.keys(CATEGORY_LABELS);
const STATUSES = Object.keys(STATUS_LABELS);

function isReservationSourceType(sourceType: string): boolean {
  return sourceType === "RESERVATION_CONFIRMATION" || sourceType === "RESERVATION_CONFIRMATION_MISSING_AMOUNT";
}

// "No matching final invoice found yet" - only meaningful for a reservation
// confirmation that hasn't been superseded (linked as DUPLICATE) by a later
// final invoice/folio.
function isMissingFinalInvoice(e: SerializedExpense): boolean {
  return e.category === "HOTEL" && isReservationSourceType(e.sourceType) && e.status !== "DUPLICATE" && !e.supersededBy;
}

interface Filters {
  q: string;
  category: string;
  status: string;
  currency: string;
  minAmount: string;
  maxAmount: string;
  minConfidence: string;
  receipt: string;
  hotelFilter: string;
}

const EMPTY_FILTERS: Filters = {
  q: "",
  category: "",
  status: "",
  currency: "",
  minAmount: "",
  maxAmount: "",
  minConfidence: "",
  receipt: "",
  hotelFilter: "",
};

export default function ExpenseTable({
  expenses,
  month,
  year,
}: {
  expenses: SerializedExpense[];
  month: number;
  year: number;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const currencies = useMemo(
    () => Array.from(new Set(expenses.map((e) => e.currency))).sort(),
    [expenses],
  );

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (filters.category && e.category !== filters.category) return false;
      if (filters.status && e.status !== filters.status) return false;
      if (filters.currency && e.currency !== filters.currency) return false;
      if (filters.minAmount && e.amount < Number(filters.minAmount)) return false;
      if (filters.maxAmount && e.amount > Number(filters.maxAmount)) return false;
      if (filters.minConfidence && e.confidenceScore < Number(filters.minConfidence)) return false;
      if (filters.receipt === "yes" && !(e.receiptSource === "ATTACHMENT" || e.receiptSource === "BOTH")) return false;
      if (filters.receipt === "no" && (e.receiptSource === "ATTACHMENT" || e.receiptSource === "BOTH")) return false;
      if (filters.hotelFilter === "reservation" && !(e.category === "HOTEL" && isReservationSourceType(e.sourceType))) return false;
      if (filters.hotelFilter === "missingInvoice" && !isMissingFinalInvoice(e)) return false;
      if (filters.hotelFilter === "missingAmount" && !(e.category === "HOTEL" && (e.amount <= 0 || e.sourceType === "RESERVATION_CONFIRMATION_MISSING_AMOUNT"))) return false;
      if (filters.q) {
        const haystack = `${e.vendor} ${e.invoiceNumber ?? ""} ${e.tripRoute ?? ""} ${e.description ?? ""} ${e.emailSubject}`.toLowerCase();
        if (!haystack.includes(filters.q.toLowerCase())) return false;
      }
      return true;
    });
  }, [expenses, filters]);

  const selectedExpenses = useMemo(
    () => expenses.filter((e) => selectedIds.has(e.id)),
    [expenses, selectedIds],
  );
  const visibleSelectedCount = filtered.filter((e) => selectedIds.has(e.id)).length;
  const allVisibleSelected = filtered.length > 0 && visibleSelectedCount === filtered.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Selects/deselects only the currently filtered (visible) rows - never
  // the full year's expenses - preserving selections outside the current
  // filter.
  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filtered.forEach((e) => next.delete(e.id));
      } else {
        filtered.forEach((e) => next.add(e.id));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function patchExpense(id: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      alert("Update failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <input
          placeholder="Search vendor, invoice #, route, description..."
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          style={{ minWidth: 260 }}
        />
        <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={filters.currency} onChange={(e) => setFilters((f) => ({ ...f, currency: e.target.value }))}>
          <option value="">All currencies</option>
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Min $"
          value={filters.minAmount}
          onChange={(e) => setFilters((f) => ({ ...f, minAmount: e.target.value }))}
          style={{ width: 90 }}
        />
        <input
          type="number"
          placeholder="Max $"
          value={filters.maxAmount}
          onChange={(e) => setFilters((f) => ({ ...f, maxAmount: e.target.value }))}
          style={{ width: 90 }}
        />
        <select value={filters.minConfidence} onChange={(e) => setFilters((f) => ({ ...f, minConfidence: e.target.value }))}>
          <option value="">Any confidence</option>
          <option value="0.8">High (&ge;0.8)</option>
          <option value="0.5">Medium (&ge;0.5)</option>
          <option value="0">Low (&ge;0)</option>
        </select>
        <select value={filters.receipt} onChange={(e) => setFilters((f) => ({ ...f, receipt: e.target.value }))}>
          <option value="">Receipt: any</option>
          <option value="yes">Has attachment</option>
          <option value="no">No attachment</option>
        </select>
        <select value={filters.hotelFilter} onChange={(e) => setFilters((f) => ({ ...f, hotelFilter: e.target.value }))}>
          <option value="">Hotel filter: any</option>
          <option value="reservation">Hotel reservation confirmations</option>
          <option value="missingInvoice">Hotel stays missing final invoice</option>
          <option value="missingAmount">Hotel expenses missing amount</option>
        </select>
        <button onClick={() => setFilters(EMPTY_FILTERS)}>Clear</button>
      </div>

      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <a href={`/api/export/csv?year=${year}&month=${month}`}>
          <button>Export month CSV</button>
        </a>
        <a href={`/api/export/zip?year=${year}&month=${month}`}>
          <button>Export month ZIP (CSV + receipts)</button>
        </a>
        <a href={`/api/export/csv?year=${year}`}>
          <button>Export full-year CSV</button>
        </a>
        <button onClick={() => window.print()}>Print report</button>
        <button onClick={() => setShowAddForm((s) => !s)}>{showAddForm ? "Cancel" : "Add expense manually"}</button>
      </div>

      {showAddForm && (
        <AddExpenseForm
          month={month}
          year={year}
          onAdded={() => {
            setShowAddForm(false);
            router.refresh();
          }}
        />
      )}

      {selectedExpenses.length > 0 && (
        <BulkActionToolbar
          selectedExpenses={selectedExpenses}
          onClear={clearSelection}
          onDone={() => {
            clearSelection();
            router.refresh();
          }}
        />
      )}

      <table>
        <thead>
          <tr>
            <th>
              <input ref={headerCheckboxRef} type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
            </th>
            <th>Date</th>
            <th>Vendor</th>
            <th>Category</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Source</th>
            <th>Confidence</th>
            <th>Receipt</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e) => (
            <ExpenseRow
              key={e.id}
              expense={e}
              expanded={expandedId === e.id}
              onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
              onPatch={(data) => patchExpense(e.id, data)}
              allExpenses={expenses}
              selected={selectedIds.has(e.id)}
              onToggleSelect={() => toggleSelect(e.id)}
            />
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={10} className="muted">
                No expenses match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ExpenseRow({
  expense: e,
  expanded,
  onToggle,
  onPatch,
  allExpenses,
  selected,
  onToggleSelect,
}: {
  expense: SerializedExpense;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (data: Record<string, unknown>) => void;
  allExpenses: SerializedExpense[];
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({
    vendor: e.vendor,
    amount: String(e.amount),
    currency: e.currency,
    category: e.category,
    description: e.description ?? "",
  });
  const [mergeTarget, setMergeTarget] = useState("");

  const statusColor =
    e.status === "CONFIRMED" ? "var(--good)" : e.status === "NEEDS_REVIEW" ? "var(--warn)" : "var(--text-dim)";

  const mergeCandidates = allExpenses.filter((o) => o.id !== e.id && o.vendor === e.vendor);

  const isReservation = isReservationSourceType(e.sourceType);
  const sourceColor =
    e.sourceType === "FINAL_INVOICE" || e.sourceType === "PAID_RECEIPT"
      ? "var(--good)"
      : e.sourceType === "POSSIBLE_CANCELLATION"
        ? "var(--bad)"
        : isReservation
          ? "var(--warn)"
          : "var(--text-dim)";

  return (
    <>
      <tr style={{ cursor: "pointer" }} onClick={onToggle}>
        <td onClick={(ev) => ev.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onToggleSelect} />
        </td>
        <td>{formatDate(e.serviceDate ?? e.invoiceDate ?? e.receivedDate)}</td>
        <td>{e.vendor}</td>
        <td>{CATEGORY_LABELS[e.category] ?? e.category}</td>
        <td>
          {formatMoney(e.amount, e.currency)}
          {isReservation && <div className="muted" style={{ fontSize: 11 }}>Estimated — final invoice not found</div>}
        </td>
        <td>
          <span className="badge" style={{ color: statusColor, background: "transparent", border: `1px solid ${statusColor}` }}>
            {STATUS_LABELS[e.status]}
          </span>
        </td>
        <td>
          <span className="badge" style={{ color: sourceColor, background: "transparent", border: `1px solid ${sourceColor}` }}>
            {SOURCE_TYPE_LABELS[e.sourceType] ?? e.sourceType}
          </span>
          {e.possibleCancellation && (
            <div className="badge" style={{ color: "var(--bad)", background: "transparent", marginTop: 4 }}>
              Possible Cancellation
            </div>
          )}
        </td>
        <td>{Math.round(e.confidenceScore * 100)}%</td>
        <td>{e.receiptSource === "ATTACHMENT" || e.receiptSource === "BOTH" ? "Attached" : e.receiptSource === "EMAIL_BODY" ? "Email body" : "None"}</td>
        <td>{expanded ? "▲" : "▼"}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={10}>
            <div className="card" style={{ background: "var(--bg)" }} onClick={(ev) => ev.stopPropagation()}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
                <Detail label="Description" value={e.description ?? "-"} />
                <Detail label="Invoice / confirmation #" value={e.invoiceNumber ?? "-"} />
                <Detail label="Tax amount" value={e.taxAmount != null ? formatMoney(e.taxAmount, e.currency) : "-"} />
                <Detail
                  label="Converted amount"
                  value={e.convertedAmount != null ? formatMoney(e.convertedAmount, e.convertedCurrency ?? "") : "Not converted"}
                />
                <Detail label="Card last 4" value={e.cardLast4 ?? "-"} />
                <Detail label="Trip route" value={e.tripRoute ?? "-"} />
                <Detail
                  label="Check-in / Check-out"
                  value={e.hotelCheckIn ? `${formatDate(e.hotelCheckIn)} → ${formatDate(e.hotelCheckOut)}` : "-"}
                />
                {e.category === "HOTEL" && <Detail label="Hotel city" value={e.hotelCity ?? "-"} />}
                {e.category === "HOTEL" && <Detail label="Guest name" value={e.guestName ?? "-"} />}
                {isReservation && (
                  <Detail
                    label="Estimated amount"
                    value={e.amount > 0 ? `${formatMoney(e.amount, e.currency)} — Estimated, final invoice not found` : "Missing Amount"}
                  />
                )}
                {e.category === "HOTEL" && (
                  <Detail
                    label="Matching final invoice found?"
                    value={e.supersededBy ? `Yes — ${SOURCE_TYPE_LABELS[e.supersededBy.sourceType] ?? e.supersededBy.sourceType}` : "No"}
                  />
                )}
                <Detail label="Email sender" value={e.emailSender} />
                <Detail label="Email subject" value={e.emailSubject} />
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>Link to Email</div>
                  <div style={{ fontSize: 14 }}>
                    <a href={e.emailLink} target="_blank" rel="noreferrer">
                      Open in Gmail
                    </a>
                  </div>
                </div>
                <Detail label="Receipt source" value={e.receiptSource} />
                <Detail label="Confidence score" value={`${Math.round(e.confidenceScore * 100)}%`} />
                <Detail label="Why classified as business" value={e.classificationReason ?? "-"} />
                {e.reviewNote && <Detail label="Review note" value={e.reviewNote} />}
                {e.isMock && <Detail label="Data source" value="MOCK (seeded test data, not real Gmail)" />}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <a href={e.emailLink} target="_blank" rel="noreferrer">
                  <button>Open original email in Gmail</button>
                </a>
                {e.attachments.map((a) => (
                  <button key={a.id} disabled title={e.isMock ? "Mock data has no real attachment to download" : undefined}>
                    View/download: {a.filename}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <button onClick={() => onPatch({ status: "CONFIRMED" })}>Confirm</button>
                <button onClick={() => onPatch({ status: "REJECTED" })}>Reject</button>
                <button onClick={() => onPatch({ status: "PERSONAL" })}>Mark personal</button>
                {e.category === "HOTEL" && isReservation && !e.possibleCancellation && (
                  <button onClick={() => onPatch({ possibleCancellation: true, reviewNote: "Marked as cancelled by user." })}>
                    Mark as cancelled
                  </button>
                )}
                <button onClick={() => setEditing((v) => !v)}>{editing ? "Cancel edit" : "Edit"}</button>
              </div>

              {editing && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <input value={edit.vendor} onChange={(ev) => setEdit((s) => ({ ...s, vendor: ev.target.value }))} placeholder="Vendor" />
                  <select
                    value={edit.category}
                    onChange={(ev) => setEdit((s) => ({ ...s, category: ev.target.value as ExpenseCategory }))}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={edit.amount}
                    onChange={(ev) => setEdit((s) => ({ ...s, amount: ev.target.value }))}
                    placeholder="Amount"
                    style={{ width: 100 }}
                  />
                  <input
                    value={edit.currency}
                    onChange={(ev) => setEdit((s) => ({ ...s, currency: ev.target.value }))}
                    placeholder="Currency"
                    style={{ width: 70 }}
                  />
                  <input
                    value={edit.description}
                    onChange={(ev) => setEdit((s) => ({ ...s, description: ev.target.value }))}
                    placeholder="Description"
                  />
                  <button
                    onClick={() => {
                      onPatch({
                        vendor: edit.vendor,
                        category: edit.category,
                        amount: edit.amount,
                        currency: edit.currency,
                        description: edit.description,
                      });
                      setEditing(false);
                    }}
                  >
                    Save
                  </button>
                </div>
              )}

              {mergeCandidates.length > 0 && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="muted" style={{ fontSize: 13 }}>Merge duplicate into this expense:</span>
                  <select value={mergeTarget} onChange={(ev) => setMergeTarget(ev.target.value)}>
                    <option value="">Select expense...</option>
                    {mergeCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatDate(c.serviceDate)} — {formatMoney(c.amount, c.currency)} ({STATUS_LABELS[c.status]})
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!mergeTarget}
                    onClick={async () => {
                      await fetch(`/api/expenses/${e.id}/merge`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ supportingId: mergeTarget }),
                      });
                      onPatch({});
                    }}
                  >
                    Merge
                  </button>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-dim)" }}>Audit history</h4>
                <AuditHistory expenseId={e.id} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}

function AddExpenseForm({ month, year, onAdded }: { month: number; year: number; onAdded: () => void }) {
  const [form, setForm] = useState({
    vendor: "",
    category: "OTHER_POTENTIAL",
    amount: "",
    currency: "CAD",
    description: "",
    serviceDate: "",
  });
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.vendor || !form.amount) {
      alert("Vendor and amount are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, month, year }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? "Failed to add expense.");
        return;
      }
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input placeholder="Vendor" value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} />
      <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <input
        type="number"
        placeholder="Amount"
        value={form.amount}
        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
        style={{ width: 100 }}
      />
      <input
        placeholder="Currency"
        value={form.currency}
        onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
        style={{ width: 70 }}
      />
      <input
        type="date"
        value={form.serviceDate}
        onChange={(e) => setForm((f) => ({ ...f, serviceDate: e.target.value }))}
      />
      <input
        placeholder="Description"
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
      />
      <button onClick={submit} disabled={saving}>
        {saving ? "Saving..." : "Save expense"}
      </button>
    </div>
  );
}
