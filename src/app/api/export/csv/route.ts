import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeExpense } from "@/lib/data";
import { expensesToCsv } from "@/lib/csv";

// Exports CONFIRMED expenses only. ?month=3 for a single month, otherwise
// the full year.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const year = Number(sp.get("year") ?? "2026");
  const month = sp.get("month") ? Number(sp.get("month")) : null;

  const expenses = await prisma.expense.findMany({
    where: { year, status: "CONFIRMED", ...(month ? { month } : {}) },
    include: {
      attachments: true,
      primaryDuplicates: { include: { supportingExpense: true } },
      supportingDuplicates: { include: { primaryExpense: true } },
    },
    orderBy: [{ month: "asc" }, { serviceDate: "asc" }],
  });

  const csv = expensesToCsv(expenses.map(serializeExpense));
  const filename = month
    ? `${year}-${String(month).padStart(2, "0")}-business-expenses.csv`
    : `${year}-business-expenses.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
