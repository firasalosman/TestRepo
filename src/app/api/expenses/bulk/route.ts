import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeEligibility, buildFieldDiff, targetStatusForAction, isStatusChangingAction } from "@/lib/bulkActions";
import type { BulkActionType, ExpenseStatus } from "@/lib/types";
import { logger } from "@/lib/logger";

const VALID_ACTIONS: BulkActionType[] = [
  "APPROVE",
  "REJECT",
  "MARK_PERSONAL",
  "MARK_DUPLICATE",
  "CHANGE_CATEGORY",
  "CHANGE_MONTH",
];

const VALID_CATEGORIES = [
  "HOTEL",
  "CAR_RENTAL",
  "TORONTO_CONDO_RENTAL",
  "GROUND_TRANSPORTATION_UBER",
  "RAIL_TRANSPORTATION",
  "OTHER_POTENTIAL",
];

// Applies one bulk review action (approve/reject/mark personal/mark
// duplicate/change category/change month) to a set of expenses as a single
// atomic transaction - either every eligible row updates, or none does.
// Rows that are ineligible (already Rejected/Personal/Duplicate without an
// explicit override, or simply not found) are reported back as `skipped`
// rather than silently dropped.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const action: BulkActionType = body.action;
  const expenseIds: string[] = Array.isArray(body.expenseIds) ? body.expenseIds : [];
  const overrideExistingStatuses: boolean = Boolean(body.overrideExistingStatuses);
  const reason: string | undefined = body.reason || undefined;

  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (expenseIds.length === 0) {
    return NextResponse.json({ error: "expenseIds must be a non-empty array" }, { status: 400 });
  }
  if (action === "CHANGE_CATEGORY" && !VALID_CATEGORIES.includes(body.category)) {
    return NextResponse.json({ error: "A valid category is required for CHANGE_CATEGORY" }, { status: 400 });
  }
  if (action === "CHANGE_MONTH" && !(Number.isInteger(body.month) && body.month >= 1 && body.month <= 12)) {
    return NextResponse.json({ error: "A valid month (1-12) is required for CHANGE_MONTH" }, { status: 400 });
  }

  const expenses = await prisma.expense.findMany({ where: { id: { in: expenseIds } } });
  const foundIds = new Set(expenses.map((e) => e.id));
  const notFoundSkipped = expenseIds.filter((id) => !foundIds.has(id)).map((id) => ({ id, reason: "Expense not found." }));

  const eligibility = computeEligibility(
    expenses.map((e) => ({ id: e.id, status: e.status as ExpenseStatus })),
    action,
    overrideExistingStatuses,
  );
  const skipped = [...notFoundSkipped, ...eligibility.skipped];

  if (eligibility.eligibleIds.length === 0) {
    return NextResponse.json({ updated: [], skipped }, { status: 400 });
  }

  const bulkActionId = randomUUID();
  const byId = new Map(expenses.map((e) => [e.id, e]));
  const ops = [];

  for (const id of eligibility.eligibleIds) {
    const expense = byId.get(id)!;
    const data: Record<string, unknown> = {};
    let actionType: string;

    if (isStatusChangingAction(action)) {
      data.status = targetStatusForAction(action);
      actionType = "STATUS_CHANGE";
      if (action === "REJECT" && reason) {
        data.reviewNote = reason;
      }
    } else if (action === "CHANGE_CATEGORY") {
      data.category = body.category;
      actionType = "CATEGORY_CHANGE";
    } else {
      // CHANGE_MONTH - only the attribution month changes; the originally
      // detected service date is preserved untouched.
      data.month = Number(body.month);
      actionType = "MONTH_CHANGE";
    }

    const before: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
      before[key] = (expense as unknown as Record<string, unknown>)[key];
    }
    const diff = buildFieldDiff(before, data);

    ops.push(
      prisma.expense.update({
        where: { id },
        data,
      }),
    );
    ops.push(
      prisma.auditLog.create({
        data: {
          expenseId: id,
          actionType,
          previousValues: JSON.stringify(diff.previousValues),
          newValues: JSON.stringify(diff.newValues),
          reason: reason ?? null,
          performedBy: "local-user",
          isBulk: true,
          bulkActionId,
        },
      }),
    );
  }

  await prisma.$transaction(ops);

  logger.info("bulk_action_applied", {
    action,
    bulkActionId,
    updatedCount: eligibility.eligibleIds.length,
    skippedCount: skipped.length,
  });

  return NextResponse.json({ updated: eligibility.eligibleIds, skipped, bulkActionId });
}
