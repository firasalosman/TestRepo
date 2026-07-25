// Gmail sync orchestrator. Runs deterministic rule-based classification and
// extraction first (see classification.ts / fieldExtraction.ts); an
// AI-assisted fallback is intentionally NOT implemented here (see README /
// .env.example AI_ASSISTED_EXTRACTION_ENABLED) - by default nothing in this
// pipeline ever sends email content to a third party.
//
// Runs incrementally: every processed Gmail message is recorded in
// EmailRecord (unique on gmailMessageId) so re-running sync skips messages
// already seen, and pagination bounds keep memory usage flat regardless of
// mailbox size.

import type { gmail_v1 } from "googleapis";
import { prisma } from "./prisma";
import { requireGmailClient, listMessagePage, getFullMessage, getAttachmentData } from "./gmailClient";
import { parseMessage, extractAttachmentText } from "./emailParsing";
import { CATEGORY_QUERIES } from "./gmailQueries";
import { classifyEmail, resolveSourceType } from "./classification";
import { extractAllFields } from "./fieldExtraction";
import { attributeExpenseDate, inferHotelServiceDate } from "./dateAttribution";
import { findDuplicates, findCancellationMatches } from "./dedup";
import type { DedupCandidate, EmailInput, ExpenseStatus, SourceType } from "./types";
import { logger } from "./logger";

const BUSINESS_CARD_LAST_FOUR = "4647";
const MAX_MESSAGES_PER_CATEGORY = 40; // keeps a single sync call bounded; run again to pick up more
const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export interface SyncSummary {
  emailsScanned: number;
  expensesCreated: number;
  duplicatesLinked: number;
  cancellationsLinked: number;
  errors: number;
}

function decodeBase64Url(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

async function processMessage(gmail: gmail_v1.Gmail, messageId: string): Promise<"created" | "skipped_no_category" | "error"> {
  const full = await getFullMessage(gmail, messageId);
  const parsed = parseMessage(full);
  const receivedDate = full.internalDate ? new Date(Number(full.internalDate)) : new Date();

  const attachmentsToRead = parsed.attachments.slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
  const attachmentTexts: string[] = [];
  const attachmentRecords: { filename: string; mimeType: string; gmailAttachmentId: string; sizeBytes: number | null }[] = [];

  for (const a of attachmentsToRead) {
    attachmentRecords.push({
      filename: a.filename,
      mimeType: a.mimeType,
      gmailAttachmentId: a.attachmentId,
      sizeBytes: a.sizeEstimate ?? null,
    });
    if ((a.sizeEstimate ?? 0) > MAX_ATTACHMENT_BYTES) continue;
    try {
      const data = await getAttachmentData(gmail, messageId, a.attachmentId);
      if (!data) continue;
      const buffer = decodeBase64Url(data);
      const text = await extractAttachmentText(a.mimeType, buffer);
      if (text) attachmentTexts.push(text);
    } catch (err) {
      logger.warn("attachment_extraction_failed", { messageId, message: err instanceof Error ? err.message : "unknown" });
    }
  }

  const emailInput: EmailInput = {
    gmailMessageId: messageId,
    gmailThreadId: full.threadId ?? undefined,
    sender: parsed.sender,
    subject: parsed.subject,
    bodyText: parsed.bodyText,
    attachmentTexts,
    attachmentFilenames: attachmentsToRead.map((a) => a.filename),
    receivedDate,
  };

  const classification = classifyEmail(emailInput);

  if (!classification.category) {
    await prisma.emailRecord.upsert({
      where: { gmailMessageId: messageId },
      create: {
        gmailMessageId: messageId,
        gmailThreadId: full.threadId,
        subject: parsed.subject,
        sender: parsed.sender,
        receivedDate,
        producedExpense: false,
      },
      update: {},
    });
    return "skipped_no_category";
  }

  const combinedText = [parsed.subject, parsed.bodyText, ...attachmentTexts].join("\n");
  const fields = extractAllFields(combinedText);

  // Hotels fall back check-out -> check-in -> received date (see
  // dateAttribution.ts for the final received-date fallback + review flag).
  const inferredServiceDate =
    fields.serviceDate ??
    (classification.category === "HOTEL" ? inferHotelServiceDate(fields.hotelCheckIn, fields.hotelCheckOut) : null) ??
    null;

  const dateAttribution = attributeExpenseDate({
    category: classification.category,
    serviceDate: inferredServiceDate,
    invoiceDate: null,
    receivedDate,
  });

  const hasAmount = fields.amount !== undefined && fields.amount > 0;

  // Reservation confirmations/cancellations are never final documents, even
  // when a total/estimated amount is present - the source-type distinction
  // (not just isFinalDocument) drives whether this can ever be Confirmed.
  const sourceType: SourceType = resolveSourceType(classification, hasAmount);
  const isReservationOrCancellation =
    sourceType === "RESERVATION_CONFIRMATION" ||
    sourceType === "RESERVATION_CONFIRMATION_MISSING_AMOUNT" ||
    sourceType === "POSSIBLE_CANCELLATION";

  let status: ExpenseStatus = "NEEDS_REVIEW";
  const isUberOffCard =
    classification.category === "GROUND_TRANSPORTATION_UBER" && fields.cardLast4 && fields.cardLast4 !== BUSINESS_CARD_LAST_FOUR;

  if (isUberOffCard) {
    status = "PERSONAL";
  } else if (
    !isReservationOrCancellation &&
    classification.confidenceScore >= 0.8 &&
    classification.isFinalDocument &&
    hasAmount &&
    !dateAttribution.needsReview
  ) {
    status = "CONFIRMED";
  }

  const amount = fields.amount ?? 0;
  const currency = fields.currency ?? "CAD";

  // For a Marriott/hotel reservation, prefer the extracted hotel property
  // name over the sender's display name as the vendor - the sender is
  // often just "Marriott Reservations", not the specific property.
  const senderDisplayName = parsed.sender.replace(/<.*>/, "").trim() || parsed.sender;
  const vendor = classification.category === "HOTEL" && fields.hotelName ? fields.hotelName : senderDisplayName;

  const reasonParts = [classification.reason];
  if (dateAttribution.needsReview) reasonParts.push(dateAttribution.reason);
  if (sourceType === "RESERVATION_CONFIRMATION_MISSING_AMOUNT") reasonParts.push("Flagged as Missing Amount.");

  const expense = await prisma.expense.create({
    data: {
      month: dateAttribution.month,
      year: dateAttribution.year,
      category: classification.category,
      status,
      vendor,
      description: parsed.subject,
      serviceDate: inferredServiceDate,
      invoiceDate: null,
      receivedDate,
      amount,
      taxAmount: fields.taxAmount ?? null,
      currency,
      invoiceNumber: fields.invoiceNumber ?? null,
      cardLast4: fields.cardLast4 ?? null,
      tripRoute: fields.tripRoute ?? null,
      hotelCheckIn: fields.hotelCheckIn ?? null,
      hotelCheckOut: fields.hotelCheckOut ?? null,
      guestName: fields.guestName ?? null,
      hotelCity: fields.hotelCity ?? null,
      sourceType,
      receiptSource: attachmentTexts.length > 0 ? (parsed.bodyText ? "BOTH" : "ATTACHMENT") : parsed.bodyText ? "EMAIL_BODY" : "NONE",
      confidenceScore: classification.confidenceScore,
      classificationReason: reasonParts.filter(Boolean).join(" "),
      gmailMessageId: messageId,
      gmailThreadId: full.threadId,
      emailSender: parsed.sender,
      emailSubject: parsed.subject,
      isMock: false,
      attachments: attachmentRecords.length > 0 ? { create: attachmentRecords } : undefined,
      auditNotes: { create: [{ note: classification.reason, source: "system" }] },
    },
  });

  await prisma.emailRecord.upsert({
    where: { gmailMessageId: messageId },
    create: {
      gmailMessageId: messageId,
      gmailThreadId: full.threadId,
      subject: parsed.subject,
      sender: parsed.sender,
      receivedDate,
      producedExpense: true,
    },
    update: { producedExpense: true },
  });

  logger.info("expense_created_from_sync", { expenseId: expense.id, category: classification.category, status });
  return "created";
}

async function reconcileDuplicates(year: number): Promise<number> {
  const expenses = await prisma.expense.findMany({
    where: { year, status: { in: ["CONFIRMED", "NEEDS_REVIEW"] } },
  });

  const candidates: DedupCandidate[] = expenses.map((e) => ({
    id: e.id,
    vendor: e.vendor,
    amount: e.amount,
    currency: e.currency,
    invoiceNumber: e.invoiceNumber,
    serviceDate: e.serviceDate,
    attachmentFilename: null,
    gmailThreadId: e.gmailThreadId,
    emailSubject: e.emailSubject,
    isFinalDocument: e.sourceType === "FINAL_INVOICE" || e.sourceType === "PAID_RECEIPT" || e.confidenceScore >= 0.8,
    hotelCheckIn: e.hotelCheckIn,
    hotelCheckOut: e.hotelCheckOut,
    guestName: e.guestName,
  }));

  const groups = findDuplicates(candidates);
  let linked = 0;

  for (const group of groups) {
    for (const supportingId of group.supportingIds) {
      await prisma.$transaction([
        prisma.expense.update({
          where: { id: supportingId },
          data: {
            status: "DUPLICATE",
            auditNotes: { create: [{ note: `Automatically linked as duplicate of ${group.primaryId}: ${group.reason}`, source: "system" }] },
          },
        }),
        prisma.duplicateLink.upsert({
          where: { primaryExpenseId_supportingExpenseId: { primaryExpenseId: group.primaryId, supportingExpenseId: supportingId } },
          create: { primaryExpenseId: group.primaryId, supportingExpenseId: supportingId, reason: group.reason },
          update: { reason: group.reason },
        }),
      ]);
      linked += 1;
    }
  }

  return linked;
}

// Matches "possible cancellation" hotel emails to the reservation
// confirmation they most likely refer to. The reservation is flagged
// (possibleCancellation: true) rather than auto-rejected - per spec, a
// charge may still have been incurred, so this stays a human decision.
// The cancellation email itself is marked DUPLICATE (excluded from totals)
// and linked as a supporting record of the reservation.
async function reconcileCancellations(year: number): Promise<number> {
  const expenses = await prisma.expense.findMany({
    where: { year, category: "HOTEL", status: { in: ["NEEDS_REVIEW", "CONFIRMED"] } },
  });

  const toCandidate = (e: (typeof expenses)[number]): DedupCandidate => ({
    id: e.id,
    vendor: e.vendor,
    amount: e.amount,
    currency: e.currency,
    invoiceNumber: e.invoiceNumber,
    serviceDate: e.serviceDate,
    attachmentFilename: null,
    gmailThreadId: e.gmailThreadId,
    emailSubject: e.emailSubject,
    isFinalDocument: e.sourceType === "FINAL_INVOICE" || e.sourceType === "PAID_RECEIPT",
    hotelCheckIn: e.hotelCheckIn,
    hotelCheckOut: e.hotelCheckOut,
    guestName: e.guestName,
  });

  const cancellations = expenses.filter((e) => e.sourceType === "POSSIBLE_CANCELLATION").map(toCandidate);
  const reservations = expenses
    .filter((e) => e.sourceType === "RESERVATION_CONFIRMATION" || e.sourceType === "RESERVATION_CONFIRMATION_MISSING_AMOUNT")
    .map(toCandidate);

  const matches = findCancellationMatches(cancellations, reservations);

  for (const match of matches) {
    await prisma.$transaction([
      prisma.expense.update({
        where: { id: match.reservationId },
        data: {
          possibleCancellation: true,
          auditNotes: {
            create: [{ note: `Possible cancellation email matched: ${match.reason}`, source: "system" }],
          },
        },
      }),
      prisma.expense.update({
        where: { id: match.cancellationId },
        data: {
          status: "DUPLICATE",
          auditNotes: {
            create: [{ note: `Linked as a cancellation for reservation ${match.reservationId}: ${match.reason}`, source: "system" }],
          },
        },
      }),
      prisma.duplicateLink.upsert({
        where: {
          primaryExpenseId_supportingExpenseId: { primaryExpenseId: match.reservationId, supportingExpenseId: match.cancellationId },
        },
        create: { primaryExpenseId: match.reservationId, supportingExpenseId: match.cancellationId, reason: match.reason },
        update: { reason: match.reason },
      }),
    ]);
  }

  return matches.length;
}

export async function runSync(year = 2026): Promise<SyncSummary> {
  const gmail = await requireGmailClient();
  const summary: SyncSummary = { emailsScanned: 0, expensesCreated: 0, duplicatesLinked: 0, cancellationsLinked: 0, errors: 0 };

  for (const { category, query } of CATEGORY_QUERIES) {
    let pageToken: string | undefined;
    let processedInCategory = 0;

    do {
      const page = await listMessagePage(gmail, query, pageToken, 25);

      for (const messageId of page.messageIds) {
        if (processedInCategory >= MAX_MESSAGES_PER_CATEGORY) break;

        const existing = await prisma.emailRecord.findUnique({ where: { gmailMessageId: messageId } });
        if (existing) continue; // already processed in a prior sync - incremental skip

        try {
          const result = await processMessage(gmail, messageId);
          summary.emailsScanned += 1;
          if (result === "created") summary.expensesCreated += 1;
        } catch (err) {
          summary.errors += 1;
          logger.error("sync_message_failed", {
            messageId,
            category,
            message: err instanceof Error ? err.message : "unknown",
          });
        }
        processedInCategory += 1;
      }

      pageToken = page.nextPageToken ?? undefined;
    } while (pageToken && processedInCategory < MAX_MESSAGES_PER_CATEGORY);
  }

  summary.duplicatesLinked = await reconcileDuplicates(year);
  summary.cancellationsLinked = await reconcileCancellations(year);

  await prisma.syncState.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", lastSyncedAt: new Date() },
    update: { lastSyncedAt: new Date() },
  });

  logger.info("sync_completed", { ...summary });
  return summary;
}
