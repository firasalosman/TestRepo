// Server-side data access + serialization helpers shared by pages and API
// routes. Keeps Prisma's Date objects out of client components (which need
// plain JSON) and centralizes the "confirmed vs potential" total rules.

import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { computeMonthlyTotals, computeYearlySummary } from "./totals";
import { buildGmailLink } from "./gmailLink";
import type { ExpenseCategory, ExpenseStatus, ReceiptSource, TotalableExpense } from "./types";

export interface SerializedExpense {
  id: string;
  month: number;
  year: number;
  category: ExpenseCategory;
  status: ExpenseStatus;
  vendor: string;
  description: string | null;
  serviceDate: string | null;
  invoiceDate: string | null;
  receivedDate: string;
  amount: number;
  taxAmount: number | null;
  currency: string;
  convertedAmount: number | null;
  convertedCurrency: string | null;
  invoiceNumber: string | null;
  cardLast4: string | null;
  tripRoute: string | null;
  hotelCheckIn: string | null;
  hotelCheckOut: string | null;
  receiptSource: ReceiptSource;
  confidenceScore: number;
  classificationReason: string | null;
  gmailMessageId: string;
  gmailThreadId: string | null;
  emailSender: string;
  emailSubject: string;
  emailLink: string; // "Link to Email" - opens the original message in Gmail
  isMock: boolean;
  reviewNote: string | null;
  attachments: { id: string; filename: string; mimeType: string; sizeBytes: number | null }[];
  duplicateOf: { id: string; vendor: string; amount: number }[]; // supporting records linked to this one, if this is primary
}

type ExpenseWithRelations = Prisma.ExpenseGetPayload<{
  include: { attachments: true; primaryDuplicates: { include: { supportingExpense: true } } };
}>;

export function serializeExpense(e: ExpenseWithRelations): SerializedExpense {
  return {
    id: e.id,
    month: e.month,
    year: e.year,
    category: e.category as ExpenseCategory,
    status: e.status as ExpenseStatus,
    vendor: e.vendor,
    description: e.description,
    serviceDate: e.serviceDate ? e.serviceDate.toISOString() : null,
    invoiceDate: e.invoiceDate ? e.invoiceDate.toISOString() : null,
    receivedDate: e.receivedDate.toISOString(),
    amount: e.amount,
    taxAmount: e.taxAmount,
    currency: e.currency,
    convertedAmount: e.convertedAmount,
    convertedCurrency: e.convertedCurrency,
    invoiceNumber: e.invoiceNumber,
    cardLast4: e.cardLast4,
    tripRoute: e.tripRoute,
    hotelCheckIn: e.hotelCheckIn ? e.hotelCheckIn.toISOString() : null,
    hotelCheckOut: e.hotelCheckOut ? e.hotelCheckOut.toISOString() : null,
    receiptSource: e.receiptSource as ReceiptSource,
    confidenceScore: e.confidenceScore,
    classificationReason: e.classificationReason,
    gmailMessageId: e.gmailMessageId,
    gmailThreadId: e.gmailThreadId,
    emailSender: e.emailSender,
    emailSubject: e.emailSubject,
    emailLink: buildGmailLink(e.gmailMessageId),
    isMock: e.isMock,
    reviewNote: e.reviewNote,
    attachments: e.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    })),
    duplicateOf: e.primaryDuplicates.map((l) => ({
      id: l.supportingExpense.id,
      vendor: l.supportingExpense.vendor,
      amount: l.supportingExpense.amount,
    })),
  };
}

export async function getExpensesForYear(year: number): Promise<SerializedExpense[]> {
  const expenses = await prisma.expense.findMany({
    where: { year },
    include: {
      attachments: true,
      primaryDuplicates: { include: { supportingExpense: true } },
    },
    orderBy: [{ month: "asc" }, { serviceDate: "asc" }],
  });
  return expenses.map(serializeExpense);
}

export function toTotalable(expenses: SerializedExpense[]): TotalableExpense[] {
  return expenses.map((e) => ({
    id: e.id,
    month: e.month,
    category: e.category,
    vendor: e.vendor,
    status: e.status,
    amount: e.amount,
    convertedAmount: e.convertedAmount,
    currency: e.currency,
  }));
}

export async function getDashboardData(year: number) {
  const expenses = await getExpensesForYear(year);
  const totalable = toTotalable(expenses);
  return {
    expenses,
    monthlyTotals: computeMonthlyTotals(totalable),
    yearlySummary: computeYearlySummary(totalable),
  };
}
