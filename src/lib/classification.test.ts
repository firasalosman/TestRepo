import { describe, expect, it } from "vitest";
import { classifyEmail } from "./classification";
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
  it("classifies Menkes condo invoices", () => {
    const result = classifyEmail(
      baseEmail({
        sender: "billing@menkes.com",
        subject: "Your March 2026 Rent Invoice - 771 Yonge St",
        bodyText: "Invoice for 771 Yonge Street, Toronto",
      }),
    );
    expect(result.category).toBe("TORONTO_CONDO_RENTAL");
    expect(result.confidenceScore).toBeGreaterThan(0.9);
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

  it("classifies VIA Rail final receipts with high confidence", () => {
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
