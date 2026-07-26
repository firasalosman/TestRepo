"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteAllDataButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleClick() {
    if (!confirm("This permanently deletes all locally stored email and expense data. Continue?")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/privacy/delete-all", { method: "POST" });
      if (!res.ok) throw new Error("Delete failed");
      router.refresh();
    } catch {
      alert("Failed to delete local data. See server logs.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      style={{
        background: "transparent",
        border: "1px solid var(--bad)",
        color: "var(--bad)",
        borderRadius: 6,
        padding: "6px 10px",
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      {busy ? "Deleting..." : "Delete all local data"}
    </button>
  );
}
