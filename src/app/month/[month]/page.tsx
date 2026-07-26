import Link from "next/link";
import { notFound } from "next/navigation";
import { getExpensesForYear, toTotalable } from "@/lib/data";
import { computeMonthlyTotals } from "@/lib/totals";
import { MONTH_NAMES, formatMoney } from "@/lib/format";
import ExpenseTable from "@/components/ExpenseTable";

export const dynamic = "force-dynamic";

const YEAR = 2026;

export default async function MonthPage({ params }: { params: { month: string } }) {
  const month = Number(params.month);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    notFound();
  }

  const allExpenses = await getExpensesForYear(YEAR);
  const monthExpenses = allExpenses.filter((e) => e.month === month);
  const totals = computeMonthlyTotals(toTotalable(allExpenses))[month - 1];

  return (
    <div className="container">
      <p>
        <Link href="/">&larr; Back to dashboard</Link>
      </p>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>
          {MONTH_NAMES[month - 1]} {YEAR}
        </h1>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{formatMoney(totals.confirmedTotal, "CAD")}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            confirmed &middot; {formatMoney(totals.potentialTotal, "CAD")} potential
          </div>
        </div>
      </header>

      <ExpenseTable expenses={monthExpenses} month={month} year={YEAR} />
    </div>
  );
}
