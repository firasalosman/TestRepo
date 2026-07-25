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
}

export interface DuplicateGroup {
  primaryId: string;
  supportingIds: string[];
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
  currency: string;
}
