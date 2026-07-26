import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeExpense } from "@/lib/data";
import { computeMonthlyTotals, computeYearlySummary } from "@/lib/totals";
import {
  applyAmountOverride,
  applyAmountRevert,
  effectiveAmountOf,
  LOCAL_USER_ID,
  validateAmountInput,
  type AmountOverrideSource,
} from "@/lib/amountOverride";
import type { TotalableExpense } from "@/lib/types";
import { logger } from "@/lib/logger";

const VALID_SOURCES: AmountOverrideSource[] = ["INLINE_LIST_EDIT", "DETAIL_EDIT", "REVERT"];

// Dedicated endpoint for manually correcting (or reverting) one expense's
// amount, separate from the generic PATCH /api/expenses/[id] route. Never
// touches the underlying Gmail message/attachment - only the DB row.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const revert: boolean = Boolean(body.revert);
  const expectedVersion: string | undefined = body.expectedVersion;
  const reason: string | undefined = body.reason || undefined;

  if (!expectedVersion) {
    return NextResponse.json({ error: "expectedVersion is required" }, { status: 400 });
  }

  const source: AmountOverrideSource = VALID_SOURCES.includes(body.source) ? body.source : "INLINE_LIST_EDIT";

  const existing = await prisma.expense.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  if (existing.updatedAt.toISOString() !== expectedVersion) {
    const fresh = await prisma.expense.findUnique({
      where: { id: params.id },
      include: {
        attachments: true,
        primaryDuplicates: { include: { supportingExpense: true } },
        supportingDuplicates: { include: { primaryExpense: true } },
      },
    });
    return NextResponse.json(
      { error: "This expense was changed elsewhere. Reload the latest value and try again.", expense: fresh ? serializeExpense(fresh) : null },
      { status: 409 },
    );
  }

  let newAmount: number | null = null;
  if (!revert) {
    const result = validateAmountInput(String(body.amount ?? ""), {
      allowNegative: Boolean(body.allowNegative),
      confirmZero: Boolean(body.confirmZero),
    });
    if (!result.valid) {
      return NextResponse.json({ error: result.error, requiresZeroConfirmation: result.requiresZeroConfirmation }, { status: 400 });
    }
    newAmount = result.amount;
  }

  const previousEffective = effectiveAmountOf(existing);
  const patch = revert ? applyAmountRevert() : applyAmountOverride(newAmount!, source, LOCAL_USER_ID);
  const newEffective = revert ? existing.amount : newAmount!;

  const [updated] = await prisma.$transaction([
    prisma.expense.update({
      where: { id: params.id },
      data: patch,
      include: {
        attachments: true,
        primaryDuplicates: { include: { supportingExpense: true } },
        supportingDuplicates: { include: { primaryExpense: true } },
      },
    }),
    prisma.auditLog.create({
      data: {
        expenseId: params.id,
        actionType: revert ? "AMOUNT_OVERRIDE_REVERTED" : "AMOUNT_OVERRIDE",
        previousValues: JSON.stringify({ effectiveAmount: previousEffective, currency: existing.currency }),
        newValues: JSON.stringify({ effectiveAmount: newEffective, currency: existing.currency }),
        reason: reason ?? null,
        source,
        performedBy: LOCAL_USER_ID,
      },
    }),
  ]);

  const year = updated.year;
  const yearExpenses = await prisma.expense.findMany({ where: { year } });
  const totalable: TotalableExpense[] = yearExpenses.map((e) => ({
    id: e.id,
    month: e.month,
    category: e.category as TotalableExpense["category"],
    vendor: e.vendor,
    status: e.status as TotalableExpense["status"],
    amount: e.amount,
    convertedAmount: e.convertedAmount,
    effectiveAmount: effectiveAmountOf(e),
    currency: e.currency,
  }));

  logger.info("expense_amount_overridden", { expenseId: params.id, revert, source });

  return NextResponse.json({
    expense: serializeExpense(updated),
    monthlyTotals: computeMonthlyTotals(totalable),
    yearlySummary: computeYearlySummary(totalable),
  });
}
