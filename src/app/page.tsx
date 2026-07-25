import { Suspense } from "react";
import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import { CATEGORY_LABELS, formatMoney, MONTH_NAMES } from "@/lib/format";
import DeleteAllDataButton from "@/components/DeleteAllDataButton";
import GmailControls from "@/components/GmailControls";
import GmailStatusBanner from "@/components/GmailStatusBanner";
import { isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

const YEAR = 2026;

export default async function DashboardPage() {
  const { monthlyTotals, yearlySummary } = await getDashboardData(YEAR);
  const dataMode = process.env.DATA_MODE ?? "mock";
  const gmailConnected = dataMode === "gmail" && (await isAuthenticated());

  return (
    <div className="container">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Business Expense Tracker</h1>
          <p className="muted" style={{ marginTop: 0 }}>2026 business expenses identified from Gmail</p>
        </div>
        <div style={{ textAlign: "right" }}>
          {dataMode === "mock" && (
            <span className="badge" style={{ background: "#3a2f10", color: "var(--warn)", marginBottom: 8, display: "inline-block" }}>
              MOCK DATA MODE — no Gmail connection
            </span>
          )}
          {dataMode === "gmail" && (
            <span
              className="badge"
              style={{
                background: gmailConnected ? "#123a26" : "#3a2f10",
                color: gmailConnected ? "var(--good)" : "var(--warn)",
                marginBottom: 8,
                display: "inline-block",
              }}
            >
              GMAIL MODE — {gmailConnected ? "connected" : "not connected"}
            </span>
          )}
          <div style={{ marginBottom: 8 }}>
            <Link href="/privacy" className="muted" style={{ fontSize: 13, marginRight: 12 }}>
              Privacy notice
            </Link>
            <DeleteAllDataButton />
          </div>
          {dataMode === "gmail" && <GmailControls connected={gmailConnected} />}
        </div>
      </header>

      <Suspense fallback={null}>
        <GmailStatusBanner />
      </Suspense>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>2026 Yearly Summary</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
          <SummaryStat label="Confirmed total" value={formatMoney(yearlySummary.totalConfirmed, "CAD")} />
          <SummaryStat label="Potential total (incl. review)" value={formatMoney(yearlySummary.totalPotential, "CAD")} />
          <SummaryStat label="Needs review" value={String(yearlySummary.needsReviewCount)} tone="warn" />
          <SummaryStat label="Missing/unclear amounts" value={String(yearlySummary.missingOrUnclearAmountCount)} tone="bad" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <h3 style={{ fontSize: 14, color: "var(--text-dim)" }}>By category</h3>
            <table>
              <tbody>
                {Object.entries(yearlySummary.byCategory)
                  .filter(([, total]) => total > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([category, total]) => (
                    <tr key={category}>
                      <td>{CATEGORY_LABELS[category] ?? category}</td>
                      <td style={{ textAlign: "right" }}>{formatMoney(total, "CAD")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 style={{ fontSize: 14, color: "var(--text-dim)" }}>By vendor</h3>
            <table>
              <tbody>
                {Object.entries(yearlySummary.byVendor)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 8)
                  .map(([vendor, total]) => (
                    <tr key={vendor}>
                      <td>{vendor}</td>
                      <td style={{ textAlign: "right" }}>{formatMoney(total, "CAD")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {monthlyTotals.map((m) => (
          <Link key={m.month} href={`/month/${m.month}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="card" style={{ cursor: "pointer", height: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>{MONTH_NAMES[m.month - 1]}</h3>
                <span
                  title={m.allReviewed ? "All expenses reviewed" : "Some expenses need review"}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: m.allReviewed ? "var(--good)" : "var(--warn)",
                    display: "inline-block",
                  }}
                />
              </div>
              <p style={{ fontSize: 24, fontWeight: 700, margin: "8px 0 4px" }}>
                {formatMoney(m.confirmedTotal, "CAD")}
              </p>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {m.expenseCount} expense{m.expenseCount === 1 ? "" : "s"} &middot;{" "}
                {m.needsReviewCount} need{m.needsReviewCount === 1 ? "s" : ""} review
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "bad" }) {
  const color = tone === "warn" ? "var(--warn)" : tone === "bad" ? "var(--bad)" : "var(--text)";
  return (
    <div>
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
