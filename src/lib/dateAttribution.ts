// Determines which calendar month an expense belongs to, per the priority
// rules: service/transaction date first, then invoice date, then the email
// received date (with a mandatory review flag in that last case).

import type { DateAttributionInput, DateAttributionResult } from "./types";

export function attributeExpenseDate(
  input: DateAttributionInput,
): DateAttributionResult {
  const { serviceDate, invoiceDate, receivedDate } = input;

  if (serviceDate) {
    return {
      attributedDate: serviceDate,
      month: serviceDate.getUTCMonth() + 1,
      year: serviceDate.getUTCFullYear(),
      needsReview: false,
      reason: "Attributed using service/transaction date.",
    };
  }

  if (invoiceDate) {
    return {
      attributedDate: invoiceDate,
      month: invoiceDate.getUTCMonth() + 1,
      year: invoiceDate.getUTCFullYear(),
      needsReview: false,
      reason: "Service date unavailable; attributed using invoice date.",
    };
  }

  return {
    attributedDate: receivedDate,
    month: receivedDate.getUTCMonth() + 1,
    year: receivedDate.getUTCFullYear(),
    needsReview: true,
    reason: "Service and invoice dates unavailable; fell back to email received date. Needs review.",
  };
}
