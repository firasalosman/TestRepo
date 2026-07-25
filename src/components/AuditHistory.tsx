"use client";

import { useEffect, useState } from "react";

interface StructuredEntry {
  id: string;
  type: "STRUCTURED";
  actionType: string;
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  reason: string | null;
  performedBy: string;
  isBulk: boolean;
  bulkActionId: string | null;
  createdAt: string;
}

interface NoteEntry {
  id: string;
  type: "NOTE";
  note: string;
  source: string;
  createdAt: string;
}

type AuditEntry = StructuredEntry | NoteEntry;

function formatChange(entry: StructuredEntry): string {
  const fields = Object.keys(entry.newValues);
  return fields
    .map((f) => `${f}: ${JSON.stringify(entry.previousValues[f])} → ${JSON.stringify(entry.newValues[f])}`)
    .join(", ");
}

// Lazily fetches this expense's full audit-history timeline (structured
// status/category/month changes plus free-text system notes) the first
// time the row is expanded.
export default function AuditHistory({ expenseId }: { expenseId: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/expenses/${expenseId}/audit`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  if (!entries) return <p className="muted">Loading audit history...</p>;
  if (entries.length === 0) return <p className="muted">No audit history yet.</p>;

  return (
    <div style={{ maxHeight: 200, overflowY: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Action</th>
            <th>Details</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{new Date(entry.createdAt).toLocaleString()}</td>
              <td>
                {entry.type === "STRUCTURED" ? entry.actionType : "SYSTEM_NOTE"}
                {entry.type === "STRUCTURED" && entry.isBulk && " (bulk)"}
              </td>
              <td>
                {entry.type === "STRUCTURED" ? (
                  <>
                    {formatChange(entry)}
                    {entry.reason && ` — ${entry.reason}`}
                  </>
                ) : (
                  entry.note
                )}
              </td>
              <td>{entry.type === "STRUCTURED" ? entry.performedBy : entry.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
