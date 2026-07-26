import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// Merges `supportingId` into the expense at `id` (the primary/authoritative
// record): the supporting expense is marked DUPLICATE and linked, matching
// the same rule the automated dedup step uses.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { supportingId, reason } = await req.json();

  if (!supportingId || typeof supportingId !== "string") {
    return NextResponse.json({ error: "supportingId is required" }, { status: 400 });
  }
  if (supportingId === params.id) {
    return NextResponse.json({ error: "Cannot merge an expense with itself" }, { status: 400 });
  }

  const [primary, supporting] = await Promise.all([
    prisma.expense.findUnique({ where: { id: params.id } }),
    prisma.expense.findUnique({ where: { id: supportingId } }),
  ]);
  if (!primary || !supporting) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.expense.update({
      where: { id: supportingId },
      data: {
        status: "DUPLICATE",
        auditNotes: { create: [{ note: `Merged into expense ${params.id} by user.`, source: "user" }] },
      },
    }),
    prisma.duplicateLink.upsert({
      where: { primaryExpenseId_supportingExpenseId: { primaryExpenseId: params.id, supportingExpenseId: supportingId } },
      create: {
        primaryExpenseId: params.id,
        supportingExpenseId: supportingId,
        reason: reason || "Manually merged by user.",
      },
      update: { reason: reason || "Manually merged by user." },
    }),
  ]);

  logger.info("expenses_merged", { primaryId: params.id, supportingId });
  return NextResponse.json({ ok: true });
}
