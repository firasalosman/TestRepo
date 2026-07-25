"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Surfaces the outcome of the OAuth callback redirect (?gmail_connected=1 /
// ?gmail_error=1) instead of silently dropping it, then strips the query
// param so refreshing doesn't keep showing the stale banner.
export default function GmailStatusBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (searchParams.get("gmail_connected")) {
      setBanner({ kind: "ok", text: "Gmail connected successfully." });
      router.replace("/");
    } else if (searchParams.get("gmail_error")) {
      setBanner({
        kind: "error",
        text: "Gmail connection failed. Check the server logs (oauth_callback_failed / oauth_callback_error) for the reason.",
      });
      router.replace("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (!banner) return null;

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        borderColor: banner.kind === "ok" ? "var(--good)" : "var(--bad)",
        color: banner.kind === "ok" ? "var(--good)" : "var(--bad)",
      }}
    >
      {banner.text}
    </div>
  );
}
