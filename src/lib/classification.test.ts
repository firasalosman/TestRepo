import { describe, expect, it } from "vitest";
import { classifyEmail, resolveSourceType } from "./classification";
import type { EmailInput } from "./types";

function baseEmail(overrides: Partial<EmailInput>): EmailInput {
  return {
    gmailMessageId: "id-1",
    sender: "test@example.com",
    subject: "",
    bodyText: "",
    receivedDate: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("classifyEmail", () => {
  it("classifies condo invoices only from the trusted ManageBuilding sender", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "donotreply@managebuilding.com",
        subject: "Your March 2026 Rent Invoice - 771 Yonge St",
        bodyText: "Invoice for 771 Yonge Street, Toronto",
      }),
    );
    expect(result.category).toBe("TORONTO_CONDO_RENTAL");
    expect(result.confidenceScore).toBeGreaterThan(0.9);
  });

  it("does not classify a condo invoice from any other sender, even with matching content", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "billing@menkes.com",
        subject: "Your March 2026 Rent Invoice - 771 Yonge St",
        bodyText: "Invoice for 771 Yonge Street, Toronto, from Menkes.",
      }),
    );
    expect(result.category).not.toBe("TORONTO_CONDO_RENTAL");
  });

  it("ignores any email from the mailbox owner's own address", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "Firas Alosman <firasalosman@gmail.com>",
        subject: "Invoice #123 - Hotel Receipt",
        bodyText: "Total paid: $500.00",
      }),
    );
    expect(result.category).toBeNull();
  });

  it("classifies Uber trips on the business card as confirmed-eligible", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "receipts@uber.com",
        subject: "Your Tuesday trip with Uber",
        bodyText: "Total charged to Visa card ending 4647: $38.42",
      }),
    );
    expect(result.category).toBe("GROUND_TRANSPORTATION_UBER");
    expect(result.confidenceScore).toBeGreaterThan(0.8);
  });

  it("flags Uber trips on a non-business card with low confidence", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "receipts@uber.com",
        subject: "Your Monday trip with Uber",
        bodyText: "Total charged to Visa card ending 1190: $15.60",
      }),
    );
    expect(result.category).toBe("GROUND_TRANSPORTATION_UBER");
    expect(result.confidenceScore).toBeLessThan(0.5);
    expect(result.reason).toContain("does not match business card");
  });

  it("prefers a final hotel folio over a booking confirmation", () => {
    const confirmation = classifyEmail(
      baseEmail({
        sender: "reservations@fairmont.com",
        subject: "Your reservation is confirmed - Fairmont Royal York",
        bodyText: "Your reservation is confirmed for check-in Jan 14.",
      }),
    );
    const folio = classifyEmail(
      baseEmail({
        sender: "folios@fairmont.com",
        subject: "Your Fairmont Royal York folio",
        bodyText: "Final folio receipt. Amount paid: $612.40",
      }),
    );
    expect(confirmation.isFinalDocument).toBe(false);
    expect(folio.isFinalDocument).toBe(true);
    expect(folio.confidenceScore).toBeGreaterThan(confirmation.confidenceScore);
  });

  it("classifies a Marriott sender as a hotel expense even with no generic hotel keywords", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "receipts@marriott.com",
        subject: "Thank you for your purchase",
        bodyText: "Total: $200.00",
      }),
    );
    expect(result.category).toBe("HOTEL");
  });

  it("classifies a Marriott match in the attachment (invoice) text as a hotel expense", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "billing@example.com",
        subject: "Your receipt",
        bodyText: "Thanks for your purchase.",
        attachmentTexts: ["Marriott International Invoice #12345, Amount paid: $300.00"],
      }),
    );
    expect(result.category).toBe("HOTEL");
  });

  it("does not treat a car rental authorization hold as a final expense", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "noreply@enterprise.com",
        subject: "A hold has been placed on your card",
        bodyText: "An authorization hold of $350 has been placed for your rental.",
      }),
    );
    expect(result.category).toBe("CAR_RENTAL");
    expect(result.isFinalDocument).toBe(false);
    expect(result.confidenceScore).toBeLessThan(0.5);
  });

  it("classifies VIA Rail final receipts only from the trusted VIA Rail sender", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "no-reply@viarail.ca",
        subject: "Your VIA Rail e-ticket receipt",
        bodyText: "Receipt for your trip Toronto to Ottawa. Amount paid: $168.50",
      }),
    );
    expect(result.category).toBe("RAIL_TRANSPORTATION");
    expect(result.confidenceScore).toBeGreaterThan(0.8);
  });

  it("does not classify a VIA Rail-looking email from any other sender", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "forwarded@example.com",
        subject: "Fwd: Your VIA Rail e-ticket receipt",
        bodyText: "Receipt for your trip Toronto to Ottawa. Amount paid: $168.50. Sent via VIA Rail.",
      }),
    );
    expect(result.category).not.toBe("RAIL_TRANSPORTATION");
  });

  it("treats a VIA Rail booking confirmation as the final document containing the ticket cost", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "no-reply@viarail.ca",
        subject: "Your VIA Rail Booking Confirmation",
        bodyText: "Booking confirmation for Toronto to Montreal. Fare: $214.75",
      }),
    );
    expect(result.category).toBe("RAIL_TRANSPORTATION");
    expect(result.isFinalDocument).toBe(true);
    expect(result.confidenceScore).toBeGreaterThan(0.8);
    expect(result.reason).toContain("Booking confirmation");
  });

  it("still flags a plain VIA Rail itinerary update (no booking confirmation) for review", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "no-reply@viarail.ca",
        subject: "Your VIA Rail itinerary update",
        bodyText: "Your itinerary for Toronto to Montreal has been updated.",
      }),
    );
    expect(result.category).toBe("RAIL_TRANSPORTATION");
    expect(result.isFinalDocument).toBe(false);
    expect(result.confidenceScore).toBeLessThan(0.6);
  });

  it("falls back to OTHER_POTENTIAL for unrecognized receipts", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "receipts@staples.ca",
        subject: "Your Staples Receipt",
        bodyText: "Thank you for your purchase. Total: $84.20",
      }),
    );
    expect(result.category).toBe("OTHER_POTENTIAL");
    expect(result.confidenceScore).toBeLessThan(0.5);
  });

  it("returns null category when nothing matches", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "friend@example.com",
        subject: "Dinner Saturday?",
        bodyText: "Are we still on for dinner this weekend?",
      }),
    );
    expect(result.category).toBeNull();
  });
});

describe("Marriott reservation confirmations (reservations@res-marriott.com)", () => {
  it("captures a reservation confirmation with a clear total as RESERVATION_CONFIRMATION, Needs Review", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "reservations@res-marriott.com",
        subject: "Your Reservation is Confirmed - Marriott Downtown Ottawa",
        bodyText: "Check-in: Apr 21, 2026 Check-out: Apr 22, 2026 Total stay estimate: $342.50",
      }),
    );
    expect(result.category).toBe("HOTEL");
    expect(result.isFinalDocument).toBe(false);
    expect(result.sourceType).toBe("RESERVATION_CONFIRMATION");
    expect(result.reason).toBe("Marriott reservation confirmation captured because no final invoice may be available.");

    const sourceType = resolveSourceType(result, true);
    expect(sourceType).toBe("RESERVATION_CONFIRMATION");
  });

  it("downgrades to RESERVATION_CONFIRMATION_MISSING_AMOUNT when no amount is present", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "reservations@res-marriott.com",
        subject: "Your Reservation is Confirmed - Marriott Downtown Calgary",
        bodyText: "Check-in: Jun 11, 2026 Check-out: Jun 12, 2026",
      }),
    );
    expect(result.category).toBe("HOTEL");
    expect(result.sourceType).toBe("RESERVATION_CONFIRMATION");

    const sourceType = resolveSourceType(result, false);
    expect(sourceType).toBe("RESERVATION_CONFIRMATION_MISSING_AMOUNT");
  });

  it("captures a cancellation email as POSSIBLE_CANCELLATION", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "reservations@res-marriott.com",
        subject: "Your Reservation Has Been Cancelled - Marriott Downtown Vancouver",
        bodyText: "Your reservation has been cancelled.",
      }),
    );
    expect(result.category).toBe("HOTEL");
    expect(result.sourceType).toBe("POSSIBLE_CANCELLATION");
    expect(result.isFinalDocument).toBe(false);
  });

  it("never resolves to CONFIRMED-eligible FINAL_INVOICE for a reservation confirmation, even with a high extracted amount", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "reservations@res-marriott.com",
        subject: "Your Reservation is Confirmed - Marriott Downtown Ottawa",
        bodyText: "Total stay estimate: $5,000.00",
      }),
    );
    // isFinalDocument stays false regardless of amount - this is what
    // prevents sync.ts from ever marking a reservation Confirmed.
    expect(result.isFinalDocument).toBe(false);
    expect(resolveSourceType(result, true)).not.toBe("FINAL_INVOICE");
  });
});

describe("Uber: business card OR trip outside Ottawa/Toronto", () => {
  it("qualifies a trip outside Ottawa/Toronto even when the card does not match 4647", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "receipts@uber.com",
        subject: "Your Tuesday trip with Uber",
        bodyText: `
Total charged to Visa card ending 1190: $32.10
8:03 AM | 789 Robson St, Vancouver, BC
8:22 AM | 200 Burrard St, Vancouver, BC
`,
      }),
    );
    expect(result.category).toBe("GROUND_TRANSPORTATION_UBER");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0.6);
    expect(result.reason).toContain("outside Ottawa and Toronto");
  });

  it("does not qualify a non-business-card trip that stayed within Toronto", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "receipts@uber.com",
        subject: "Your Tuesday trip with Uber",
        bodyText: `
Total charged to Visa card ending 1190: $15.60
8:03 AM | 123 King St W, Toronto, ON
8:22 AM | 456 Queen St, Toronto, ON
`,
      }),
    );
    expect(result.category).toBe("GROUND_TRANSPORTATION_UBER");
    expect(result.confidenceScore).toBeLessThan(0.5);
    expect(result.reason).toContain("does not match business card");
  });

  it("does not qualify a non-business-card trip with no detectable location (unknown, not assumed outside)", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "receipts@uber.com",
        subject: "Your Tuesday trip with Uber",
        bodyText: "Total charged to Visa card ending 1190: $15.60",
      }),
    );
    expect(result.confidenceScore).toBeLessThan(0.5);
  });

  it("still qualifies via the business card even when the trip is within Ottawa/Toronto", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "receipts@uber.com",
        subject: "Your Tuesday trip with Uber",
        bodyText: `
Total charged to Visa card ending 4647: $12.00
8:03 AM | 1 Elgin St, Ottawa, ON
`,
      }),
    );
    expect(result.confidenceScore).toBeGreaterThan(0.8);
    expect(result.reason).toContain("business card");
  });
});
