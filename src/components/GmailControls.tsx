"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GmailControls({ connected }: { connected: boolean }) {
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error ?? "Sync failed.");
        return;
      }
      setMessage(
        `Scanned ${body.emailsScanned} email(s), created ${body.expensesCreated} expense(s), linked ${body.duplicatesLinked} duplicate(s), matched ${body.cancellationsLinked} cancellation(s).`,
      );
      router.refresh();
    } catch {
      setMessage("Sync failed. See server logs.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleLogout() {
    if (!confirm("Disconnect and revoke Gmail access? Your locally stored expense data is kept.")) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {connected ? (
          <>
            <button onClick={handleSync} disabled={syncing}>
              {syncing ? "Syncing..." : "Sync Gmail now"}
            </button>
            <button onClick={handleLogout} disabled={busy}>
              Logout / revoke access
            </button>
          </>
        ) : (
          <a href="/api/auth/google/start">
            <button>Connect Gmail</button>
          </a>
        )}
      </div>
      {message && <div className="muted" style={{ fontSize: 12, maxWidth: 320, textAlign: "right" }}>{message}</div>}
    </div>
  );
}
