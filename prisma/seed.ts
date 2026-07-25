/* eslint-disable no-console */
// Seed script for local "mock" mode. Generates realistic-looking (but
// entirely fake) 2026 business expenses across every supported category so
// the dashboard, review workflow, filters, and export flows can be tested
// without ever connecting to Gmail. All rows are flagged isMock=true.

import { PrismaClient } from "@prisma/client";
import type { ExpenseCategory, ExpenseStatus, ReceiptSource } from "../src/lib/types";

const prisma = new PrismaClient();

type SeedExpense = {
  month: number;
  category: ExpenseCategory;
  status: ExpenseStatus;
  vendor: string;
  description?: string;
  serviceDate: string;
  invoiceDate?: string;
  receivedDate: string;
  amount: number;
  taxAmount?: number;
  currency?: string;
  convertedAmount?: number;
  convertedCurrency?: string;
  invoiceNumber?: string;
  cardLast4?: string;
  tripRoute?: string;
  hotelCheckIn?: string;
  hotelCheckOut?: string;
  receiptSource: ReceiptSource;
  confidenceScore: number;
  classificationReason: string;
  gmailMessageId: string;
  gmailThreadId?: string;
  emailSender: string;
  emailSubject: string;
  reviewNote?: string;
};

const YEAR = 2026;

function d(month: number, day: number): string {
  return new Date(Date.UTC(YEAR, month - 1, day)).toISOString();
}

const menkesRent: SeedExpense[] = Array.from({ length: 12 }, (_, i) => {
  const month = i + 1;
  return {
    month,
    category: "TORONTO_CONDO_RENTAL",
    status: "CONFIRMED",
    vendor: "Menkes Property Management",
    description: "Monthly rental - 771 Yonge Street, Toronto",
    serviceDate: d(month, 1),
    invoiceDate: d(month, 1),
    receivedDate: d(month, 1),
    amount: 3200 + (i % 3 === 0 ? 50 : 0),
    taxAmount: 0,
    currency: "CAD",
    invoiceNumber: `MENKES-2026-${String(month).padStart(2, "0")}`,
    receiptSource: "ATTACHMENT",
    confidenceScore: 0.97,
    classificationReason: "Sender is donotreply@managebuilding.com, the trusted Menkes/ManageBuilding invoice sender.",
    gmailMessageId: `mock-menkes-2026-${month}`,
    gmailThreadId: `mock-thread-menkes-${month}`,
    emailSender: "donotreply@managebuilding.com",
    emailSubject: `Your ${new Date(Date.UTC(2026, month - 1)).toLocaleString("en-US", { month: "long" })} 2026 Rent Invoice - 771 Yonge St`,
  };
});

const other: SeedExpense[] = [
  // --- Hotels: booking confirmation + final invoice (dedup example) ---
  {
    month: 1,
    category: "HOTEL",
    status: "DUPLICATE",
    vendor: "Fairmont Royal York",
    description: "Booking confirmation (superseded by final invoice)",
    serviceDate: d(1, 14),
    invoiceDate: d(1, 10),
    receivedDate: d(1, 10),
    amount: 640,
    currency: "CAD",
    invoiceNumber: "CONF-88213",
    hotelCheckIn: d(1, 14),
    hotelCheckOut: d(1, 16),
    receiptSource: "EMAIL_BODY",
    confidenceScore: 0.55,
    classificationReason: "Booking confirmation email; superseded by final hotel folio.",
    gmailMessageId: "mock-hotel-fairmont-conf-jan",
    gmailThreadId: "mock-thread-hotel-fairmont-jan",
    emailSender: "reservations@fairmont.com",
    emailSubject: "Your reservation is confirmed - Fairmont Royal York",
    reviewNote: "Superseded by final folio MENKES... (see linked primary expense).",
  },
  {
    month: 1,
    category: "HOTEL",
    status: "CONFIRMED",
    vendor: "Fairmont Royal York",
    description: "Final folio - 2 nights, client meetings",
    serviceDate: d(1, 16),
    invoiceDate: d(1, 16),
    receivedDate: d(1, 16),
    amount: 612.4,
    taxAmount: 72.4,
    currency: "CAD",
    invoiceNumber: "FOLIO-88213",
    hotelCheckIn: d(1, 14),
    hotelCheckOut: d(1, 16),
    receiptSource: "ATTACHMENT",
    confidenceScore: 0.93,
    classificationReason: "Final hotel folio with paid amount; preferred over booking confirmation.",
    gmailMessageId: "mock-hotel-fairmont-folio-jan",
    gmailThreadId: "mock-thread-hotel-fairmont-jan",
    emailSender: "folios@fairmont.com",
    emailSubject: "Your Fairmont Royal York folio (Checkout receipt)",
  },
  {
    month: 3,
    category: "HOTEL",
    status: "CONFIRMED",
    vendor: "Marriott Downtown Ottawa",
    description: "1 night, vendor negotiation trip",
    serviceDate: d(3, 5),
    invoiceDate: d(3, 5),
    receivedDate: d(3, 5),
    amount: 289.15,
    taxAmount: 34.15,
    currency: "CAD",
    invoiceNumber: "MAR-550219",
    hotelCheckIn: d(3, 4),
    hotelCheckOut: d(3, 5),
    receiptSource: "ATTACHMENT",
    confidenceScore: 0.91,
    classificationReason: "Post-stay receipt PDF attached with itemized paid amount.",
    gmailMessageId: "mock-hotel-marriott-mar",
    emailSender: "receipts@marriott.com",
    emailSubject: "Thank you for staying with us - Your Receipt",
  },

  // --- Car rentals ---
  {
    month: 2,
    category: "CAR_RENTAL",
    status: "CONFIRMED",
    vendor: "Hertz",
    description: "3-day rental, client site visit (Kitchener)",
    serviceDate: d(2, 12),
    invoiceDate: d(2, 12),
    receivedDate: d(2, 12),
    amount: 214.87,
    taxAmount: 24.87,
    currency: "CAD",
    invoiceNumber: "HZ-9931201",
    receiptSource: "ATTACHMENT",
    confidenceScore: 0.9,
    classificationReason: "Final rental closing invoice, not an authorization hold.",
    gmailMessageId: "mock-hertz-feb",
    emailSender: "noreply@hertz.com",
    emailSubject: "Your Hertz Rental Receipt - Agreement #9931201",
  },
  {
    month: 6,
    category: "CAR_RENTAL",
    status: "NEEDS_REVIEW",
    vendor: "Enterprise",
    description: "Authorization hold - awaiting final invoice",
    serviceDate: d(6, 20),
    receivedDate: d(6, 20),
    amount: 350,
    currency: "CAD",
    receiptSource: "EMAIL_BODY",
    confidenceScore: 0.4,
    classificationReason:
      "Message appears to be a card authorization hold, not a final rental invoice; flagged for review.",
    gmailMessageId: "mock-enterprise-hold-jun",
    emailSender: "noreply@enterprise.com",
    emailSubject: "A hold has been placed on your card",
  },

  // --- Uber (business card 4647 only) ---
  {
    month: 1,
    category: "GROUND_TRANSPORTATION_UBER",
    status: "CONFIRMED",
    vendor: "Uber",
    description: "Airport to client office",
    serviceDate: d(1, 15),
    receivedDate: d(1, 15),
    amount: 38.42,
    currency: "CAD",
    cardLast4: "4647",
    receiptSource: "EMAIL_BODY",
    confidenceScore: 0.88,
    classificationReason: "Charged to business card ending 4647 per receipt body.",
    gmailMessageId: "mock-uber-jan-1",
    emailSender: "receipts@uber.com",
    emailSubject: "Your Tuesday trip with Uber",
  },
  {
    month: 4,
    category: "GROUND_TRANSPORTATION_UBER",
    status: "CONFIRMED",
    vendor: "Uber",
    description: "Client dinner - downtown",
    serviceDate: d(4, 9),
    receivedDate: d(4, 9),
    amount: 22.1,
    currency: "CAD",
    cardLast4: "4647",
    receiptSource: "EMAIL_BODY",
    confidenceScore: 0.86,
    classificationReason: "Charged to business card ending 4647 per receipt body.",
    gmailMessageId: "mock-uber-apr-1",
    emailSender: "receipts@uber.com",
    emailSubject: "Your Thursday trip with Uber",
  },
  // Personal Uber trip (different card) - excluded from business totals by rule,
  // kept here only to demonstrate the card filter in the UI as Rejected.
  {
    month: 4,
    category: "GROUND_TRANSPORTATION_UBER",
    status: "PERSONAL",
    vendor: "Uber",
    description: "Personal trip - different payment card",
    serviceDate: d(4, 20),
    receivedDate: d(4, 20),
    amount: 15.6,
    currency: "CAD",
    cardLast4: "1190",
    receiptSource: "EMAIL_BODY",
    confidenceScore: 0.2,
    classificationReason:
      "Card ending 1190 does not match business card 4647; excluded from business totals per rule.",
    gmailMessageId: "mock-uber-apr-2",
    emailSender: "receipts@uber.com",
    emailSubject: "Your Monday trip with Uber",
  },

  // --- VIA Rail ---
  {
    month: 5,
    category: "RAIL_TRANSPORTATION",
    status: "CONFIRMED",
    vendor: "VIA Rail",
    description: "Toronto - Ottawa, business meeting",
    serviceDate: d(5, 8),
    invoiceDate: d(5, 8),
    receivedDate: d(5, 8),
    amount: 168.5,
    currency: "CAD",
    invoiceNumber: "VIA-7742199",
    tripRoute: "Toronto -> Ottawa",
    receiptSource: "ATTACHMENT",
    confidenceScore: 0.92,
    classificationReason: "Final e-ticket receipt with paid amount; matches route pattern.",
    gmailMessageId: "mock-via-may",
    emailSender: "no-reply@viarail.ca",
    emailSubject: "Your VIA Rail e-ticket receipt",
  },
  {
    month: 9,
    category: "RAIL_TRANSPORTATION",
    status: "NEEDS_REVIEW",
    vendor: "VIA Rail",
    description: "Toronto - Montreal, conference",
    serviceDate: d(9, 18),
    receivedDate: d(9, 18),
    amount: 214.75,
    currency: "CAD",
    tripRoute: "Toronto -> Montreal",
    receiptSource: "EMAIL_BODY",
    confidenceScore: 0.6,
    classificationReason: "Itinerary email found; final receipt not yet located, flagged for review.",
    gmailMessageId: "mock-via-sep",
    emailSender: "no-reply@viarail.ca",
    emailSubject: "Your VIA Rail itinerary update",
  },

  // --- Other potential business expense (manual review required) ---
  {
    month: 7,
    category: "OTHER_POTENTIAL",
    status: "NEEDS_REVIEW",
    vendor: "Staples",
    description: "Office supplies - possible business expense",
    serviceDate: d(7, 3),
    receivedDate: d(7, 3),
    amount: 84.2,
    currency: "CAD",
    receiptSource: "ATTACHMENT",
    confidenceScore: 0.35,
    classificationReason:
      "Receipt keywords matched generic business-supply pattern; category and business purpose unclear.",
    gmailMessageId: "mock-other-staples-jul",
    emailSender: "receipts@staples.ca",
    emailSubject: "Your Staples Receipt",
  },
  {
    month: 11,
    category: "OTHER_POTENTIAL",
    status: "NEEDS_REVIEW",
    vendor: "LinkedIn",
    description: "Possible business subscription",
    serviceDate: d(11, 2),
    receivedDate: d(11, 2),
    amount: 59.99,
    currency: "USD",
    convertedAmount: 82.1,
    convertedCurrency: "CAD",
    receiptSource: "EMAIL_BODY",
    confidenceScore: 0.3,
    classificationReason: "Subscription receipt; business purpose not confirmed.",
    gmailMessageId: "mock-other-linkedin-nov",
    emailSender: "billing@linkedin.com",
    emailSubject: "Your LinkedIn Premium receipt",
  },

  // --- Missing/unclear amount example (surfaces in yearly summary) ---
  {
    month: 8,
    category: "HOTEL",
    status: "NEEDS_REVIEW",
    vendor: "Unknown Hotel (OCR incomplete)",
    description: "Amount unreadable in scanned receipt image",
    serviceDate: d(8, 11),
    receivedDate: d(8, 11),
    amount: 0,
    currency: "CAD",
    receiptSource: "ATTACHMENT",
    confidenceScore: 0.15,
    classificationReason: "Attachment is a low-resolution scanned image; amount could not be extracted reliably.",
    gmailMessageId: "mock-hotel-unclear-aug",
    emailSender: "reservations@unknownhotel.example",
    emailSubject: "Your hotel receipt",
    reviewNote: "Amount could not be extracted automatically - needs manual entry.",
  },
];

const seedData = [...menkesRent, ...other];

async function main() {
  console.log(`Seeding ${seedData.length} mock expenses for ${YEAR}...`);

  await prisma.duplicateLink.deleteMany();
  await prisma.auditNote.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.emailRecord.deleteMany();

  const created: Record<string, string> = {};

  for (const e of seedData) {
    const expense = await prisma.expense.create({
      data: {
        month: e.month,
        year: YEAR,
        category: e.category,
        status: e.status,
        vendor: e.vendor,
        description: e.description,
        serviceDate: e.serviceDate ? new Date(e.serviceDate) : undefined,
        invoiceDate: e.invoiceDate ? new Date(e.invoiceDate) : undefined,
        receivedDate: new Date(e.receivedDate),
        amount: e.amount,
        taxAmount: e.taxAmount,
        currency: e.currency ?? "CAD",
        convertedAmount: e.convertedAmount,
        convertedCurrency: e.convertedCurrency,
        invoiceNumber: e.invoiceNumber,
        cardLast4: e.cardLast4,
        tripRoute: e.tripRoute,
        hotelCheckIn: e.hotelCheckIn ? new Date(e.hotelCheckIn) : undefined,
        hotelCheckOut: e.hotelCheckOut ? new Date(e.hotelCheckOut) : undefined,
        receiptSource: e.receiptSource,
        confidenceScore: e.confidenceScore,
        classificationReason: e.classificationReason,
        gmailMessageId: e.gmailMessageId,
        gmailThreadId: e.gmailThreadId,
        emailSender: e.emailSender,
        emailSubject: e.emailSubject,
        reviewNote: e.reviewNote,
        isMock: true,
        attachments:
          e.receiptSource === "ATTACHMENT" || e.receiptSource === "BOTH"
            ? {
                create: [
                  {
                    filename: `${e.vendor.replace(/\s+/g, "_").toLowerCase()}_receipt.pdf`,
                    mimeType: "application/pdf",
                    sizeBytes: 84213,
                  },
                ],
              }
            : undefined,
        auditNotes: {
          create: [
            {
              note: e.classificationReason,
              source: "system",
            },
          ],
        },
      },
    });
    created[e.gmailMessageId] = expense.id;
  }

  // Link the January Fairmont duplicate pair.
  if (created["mock-hotel-fairmont-conf-jan"] && created["mock-hotel-fairmont-folio-jan"]) {
    await prisma.duplicateLink.create({
      data: {
        primaryExpenseId: created["mock-hotel-fairmont-folio-jan"],
        supportingExpenseId: created["mock-hotel-fairmont-conf-jan"],
        reason: "Same stay (Jan 14-16, Fairmont Royal York); final folio preferred over booking confirmation.",
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
