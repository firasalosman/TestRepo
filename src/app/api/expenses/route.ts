import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeExpense } from "@/lib/data";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const where: Record<string, unknown> = {};
  const year = sp.get("year");
  const month = sp.get("month");
  const vendor = sp.get("vendor");
  const category = sp.get("category");
  const status = sp.get("status");
  const sourceType = sp.get("sourceType");
  const currency = sp.get("currency");
  const minAmount = sp.get("minAmount");
  const maxAmount = sp.get("maxAmount");
  const minConfidence = sp.get("minConfidence");
  const hasReceipt = sp.get("hasReceipt");
  const q = sp.get("q");

  if (year) where.year = Number(year);
  if (month) where.month = Number(month);
  if (vendor) where.vendor = { contains: vendor };
  if (category) where.category = category;
  if (status) where.status = status;
  if (sourceType) where.sourceType = sourceType;
  if (currency) where.currency = currency;
  if (minConfidence) where.confidenceScore = { gte: Number(minConfidence) };
  if (minAmount || maxAmount) {
    where.amount = {
      ...(minAmount ? { gte: Number(minAmount) } : {}),
      ...(maxAmount ? { lte: Number(maxAmount) } : {}),
    };
  }
  if (hasReceipt === "true") where.receiptSource = { in: ["ATTACHMENT", "BOTH"] };
  if (hasReceipt === "false") where.receiptSource = { in: ["EMAIL_BODY", "NONE"] };

  if (q) {
    where.OR = [
      { vendor: { contains: q } },
      { invoiceNumber: { contains: q } },
      { tripRoute: { contains: q } },
      { description: { contains: q } },
      { emailSubject: { contains: q } },
    ];
  }

  const expenses = await prisma.expense.findMany({
    where,
    include: {
      attachments: true,
      primaryDuplicates: { include: { supportingExpense: true } },
      supportingDuplicates: { include: { primaryExpense: true } },
    },
    orderBy: [{ month: "asc" }, { serviceDate: "asc" }],
  });

  return NextResponse.json(expenses.map(serializeExpense));
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const required = ["vendor", "amount", "currency", "category", "month", "year"];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  const now = new Date();
  const expense = await prisma.expense.create({
    include: {
      attachments: true,
      primaryDuplicates: { include: { supportingExpense: true } },
      supportingDuplicates: { include: { primaryExpense: true } },
    },
    data: {
      month: Number(body.month),
      year: Number(body.year),
      category: body.category,
      status: "CONFIRMED",
      vendor: body.vendor,
      description: body.description ?? "Manually added expense",
      serviceDate: body.serviceDate ? new Date(body.serviceDate) : now,
      receivedDate: now,
      amount: Number(body.amount),
      currency: body.currency,
      receiptSource: "NONE",
      confidenceScore: 1,
      sourceType: "FINAL_INVOICE",
      classificationReason: "Manually added by user.",
      gmailMessageId: `manual-${randomUUID()}`,
      emailSender: "manual-entry",
      emailSubject: "Manually added expense",
      isMock: false,
      auditNotes: {
        create: [{ note: "Manually added by user.", source: "user" }],
      },
    },
  });

  logger.info("expense_manually_added", { expenseId: expense.id });
  return NextResponse.json(serializeExpense(expense), { status: 201 });
}
