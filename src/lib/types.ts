// Shared plain-object types used by the pure business-logic libraries
// (classification, date attribution, dedup, totals). Kept independent of
// Prisma's generated types so these modules are trivial to unit test.

export type ExpenseCategory =
  | "HOTEL"
  | "CAR_RENTAL"
  | "TORONTO_CONDO_RENTAL"
  | "GROUND_TRANSPORTATION_UBER"
  | "RAIL_TRANSPORTATION"
  | "OTHER_POTENTIAL";

export type ReceiptSource = "ATTACHMENT" | "EMAIL_BODY" | "BOTH" | "NONE";

// Distinguishes what kind of document an expense was derived from. Hotel
// reservation confirmations (e.g. Marriott) are captured as potential
// expenses even when no final invoice/folio is ever found - see
// classification.ts and sync.ts.
export type SourceType =
  | "FINAL_INVOICE"
  | "PAID_RECEIPT"
  | "RESERVATION_CONFIRMATION"
  | "RESERVATION_CONFIRMATION_MISSING_AMOUNT"
  | "POSSIBLE_CANCELLATION"
  | "UNKNOWN";

export type ExpenseStatus =
  | "CONFIRMED"
  | "NEEDS_REVIEW"
  | "REJECTED"
  | "PERSONAL"
  | "DUPLICATE";

export interface EmailInput {
  gmailMessageId: string;
  gmailThreadId?: string;
  sender: string;
  subject: string;
  bodyText: string;
  attachmentTexts?: string[];
  attachmentFilenames?: string[];
  receivedDate: Date;
}

export interface ClassificationResult {
  category: ExpenseCategory | null;
  confidenceScore: number; // 0..1
  reason: string;
  isFinalDocument: boolean; // true = invoice/folio/final receipt, false = confirmation/hold
  // Set explicitly for hotel reservation confirmations/cancellations; other
  // categories leave this undefined and sync.ts derives a default from
  // isFinalDocument (FINAL_INVOICE vs UNKNOWN).
  sourceType?: SourceType;
}

export interface DateAttributionInput {
  category: ExpenseCategory;
  serviceDate?: Date | null;
  invoiceDate?: Date | null;
  receivedDate: Date;
}

export interface DateAttributionResult {
  attributedDate: Date;
  month: number; // 1-12
  year: number;
  needsReview: boolean;
  reason: string;
}

export interface DedupCandidate {
  id: string;
  vendor: string;
  amount: number;
  currency: string;
  invoiceNumber?: string | null;
  serviceDate?: Date | null;
  attachmentFilename?: string | null;
  gmailThreadId?: string | null;
  emailSubject: string;
  isFinalDocument: boolean;
  // Optional hotel-stay matching keys - used as a fallback when no shared
  // invoice/confirmation number exists (e.g. matching a Marriott reservation
  // confirmation to its later final invoice by stay dates/guest instead).
  hotelCheckIn?: Date | null;
  hotelCheckOut?: Date | null;
  guestName?: string | null;
}

export interface DuplicateGroup {
  primaryId: string;
  supportingIds: string[];
  reason: string;
}

export interface CancellationMatch {
  reservationId: string;
  cancellationId: string;
  reason: string;
}

export interface TotalableExpense {
  id: string;
  month: number;
  category: ExpenseCategory;
  vendor: string;
  status: ExpenseStatus;
  amount: number;
  convertedAmount?: number | null;
  effectiveAmount?: number | null;
  currency: string;
}

export type BulkActionType =
  | "APPROVE"
  | "REJECT"
  | "MARK_PERSONAL"
  | "MARK_DUPLICATE"
  | "CHANGE_CATEGORY"
  | "CHANGE_MONTH";

// Statuses that represent a prior manual decision - overriding them with a
// bulk status-changing action requires explicit confirmation.
export const ALREADY_DECIDED_STATUSES: ExpenseStatus[] = ["REJECTED", "PERSONAL", "DUPLICATE"];

export interface BulkEligibilityInput {
  id: string;
  status: ExpenseStatus;
}

export interface BulkSkipped {
  id: string;
  reason: string;
}
