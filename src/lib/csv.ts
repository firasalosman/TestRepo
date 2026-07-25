import type { SerializedExpense } from "./data";
import { CATEGORY_LABELS, STATUS_LABELS } from "./format";

const HEADERS = [
  "Date",
  "Vendor",
  "Category",
  "Description",
  "Amount",
  "Currency",
  "Converted Amount",
  "Converted Currency",
  "Tax Amount",
  "Invoice Number",
  "Card Last 4",
  "Status",
  "Confidence Score",
  "Email Sender",
  "Email Subject",
  "Link to Email",
  "Gmail Message ID",
];

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function expensesToCsv(expenses: SerializedExpense[]): string {
  const rows = expenses.map((e) =>
    [
      e.serviceDate ?? e.invoiceDate ?? e.receivedDate,
      e.vendor,
      CATEGORY_LABELS[e.category] ?? e.category,
      e.description ?? "",
      e.amount,
      e.currency,
      e.convertedAmount ?? "",
      e.convertedCurrency ?? "",
      e.taxAmount ?? "",
      e.invoiceNumber ?? "",
      e.cardLast4 ?? "",
      STATUS_LABELS[e.status] ?? e.status,
      e.confidenceScore,
      e.emailSender,
      e.emailSubject,
      e.emailLink,
      e.gmailMessageId,
    ]
      .map(escapeCsv)
      .join(","),
  );

  return [HEADERS.join(","), ...rows].join("\n");
}
