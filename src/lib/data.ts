// Server-side data access + serialization helpers shared by pages and API
// routes. Keeps Prisma's Date objects out of client components (which need
// plain JSON) and centralizes the "confirmed vs potential" total rules.

import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { computeMonthlyTotals, computeYearlySummary } from "./totals";
import { buildGmailLink } from "./gmailLink";
import { effectiveAmountOf } from "./amountOverride";
import type { ExpenseCategory, ExpenseStatus, ReceiptSource, SourceType, TotalableExpense } from "./types";

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
  amount: number; // parser/sync-extracted amount - see `parsedAmount` alias below
  parsedAmount: number; // alias of `amount`, exposed for clarity alongside effectiveAmount
  taxAmount: number | null;
  currency: string;
  convertedAmount: number | null;
  convertedCurrency: string | null;
  effectiveAmount: number; // authoritative amount for totals/export - manual override if present, else `amount`
  amountManuallyOverridden: boolean;
  amountOverrideTimestamp: string | null;
  amountOverrideSource: string | null;
  amountOverrideUser: string | null;
  version: string; // optimistic-concurrency token for the amount-override API (Prisma's updatedAt, ISO string)
  invoiceNumber: string | null;
  cardLast4: string | null;
  tripRoute: string | null;
  hotelCheckIn: string | null;
  hotelCheckOut: string | null;
  guestName: string | null;
  hotelCity: string | null;
  pickupAddress: string | null;
  pickupCity: string | null;
  dropoffAddress: string | null;
  dropoffCity: string | null;
  tripCountry: string | null;
  sourceType: SourceType;
  possibleCancellation: boolean;
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
  // Set when this expense is itself a supporting record (e.g. a reservation
  // confirmation later matched to a final invoice, or a cancellation email
  // matched to a reservation) - lets the UI show "a matching final invoice
  // was found" for reservation confirmations.
  supersededBy: { id: string; vendor: string; amount: number; sourceType: SourceType } | null;
}

type ExpenseWithRelations = Prisma.ExpenseGetPayload<{
  include: {
    attachments: true;
    primaryDuplicates: { include: { supportingExpense: true } };
    supportingDuplicates: { include: { primaryExpense: true } };
  };
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
    parsedAmount: e.amount,
    taxAmount: e.taxAmount,
    currency: e.currency,
    convertedAmount: e.convertedAmount,
    convertedCurrency: e.convertedCurrency,
    effectiveAmount: effectiveAmountOf(e),
    amountManuallyOverridden: e.amountManuallyOverridden,
    amountOverrideTimestamp: e.amountOverrideTimestamp ? e.amountOverrideTimestamp.toISOString() : null,
    amountOverrideSource: e.amountOverrideSource,
    amountOverrideUser: e.amountOverrideUser,
    version: e.updatedAt.toISOString(),
    invoiceNumber: e.invoiceNumber,
    cardLast4: e.cardLast4,
    tripRoute: e.tripRoute,
    hotelCheckIn: e.hotelCheckIn ? e.hotelCheckIn.toISOString() : null,
    hotelCheckOut: e.hotelCheckOut ? e.hotelCheckOut.toISOString() : null,
    guestName: e.guestName,
    hotelCity: e.hotelCity,
    pickupAddress: e.pickupAddress,
    pickupCity: e.pickupCity,
    dropoffAddress: e.dropoffAddress,
    dropoffCity: e.dropoffCity,
    tripCountry: e.tripCountry,
    sourceType: e.sourceType as SourceType,
    possibleCancellation: e.possibleCancellation,
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
    supersededBy: e.supportingDuplicates[0]
      ? {
          id: e.supportingDuplicates[0].primaryExpense.id,
          vendor: e.supportingDuplicates[0].primaryExpense.vendor,
          amount: e.supportingDuplicates[0].primaryExpense.amount,
          sourceType: e.supportingDuplicates[0].primaryExpense.sourceType as SourceType,
        }
      : null,
  };
}

export async function getExpensesForYear(year: number): Promise<SerializedExpense[]> {
  const expenses = await prisma.expense.findMany({
    where: { year },
    include: {
      attachments: true,
      primaryDuplicates: { include: { supportingExpense: true } },
      supportingDuplicates: { include: { primaryExpense: true } },
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
    effectiveAmount: e.effectiveAmount,
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
