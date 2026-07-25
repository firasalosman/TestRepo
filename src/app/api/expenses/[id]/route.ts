import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeExpense } from "@/lib/data";
import { logger } from "@/lib/logger";

const EDITABLE_FIELDS = ["vendor", "category", "amount", "currency", "month", "year", "description"] as const;
const VALID_STATUSES = ["CONFIRMED", "NEEDS_REVIEW", "REJECTED", "PERSONAL", "DUPLICATE"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
  }

  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      data[field] = field === "amount" ? Number(body[field]) : field === "month" || field === "year" ? Number(body[field]) : body[field];
    }
  }

  if (body.serviceDate !== undefined) {
    data.serviceDate = body.serviceDate ? new Date(body.serviceDate) : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const existing = await prisma.expense.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  const updated = await prisma.expense.update({
    where: { id: params.id },
    data: {
      ...data,
      auditNotes: {
        create: [
          {
            note: `User updated fields: ${Object.keys(data).join(", ")}${body.reviewNote ? ` — ${body.reviewNote}` : ""}`,
            source: "user",
          },
        ],
      },
      ...(body.reviewNote !== undefined ? { reviewNote: body.reviewNote } : {}),
    },
    include: {
      attachments: true,
      primaryDuplicates: { include: { supportingExpense: true } },
    },
  });

  logger.info("expense_updated", { expenseId: params.id, fields: Object.keys(data).join(",") });
  return NextResponse.json(serializeExpense(updated));
}
