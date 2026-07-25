import { describe, expect, it } from "vitest";
import { findDuplicates } from "./dedup";
import type { DedupCandidate } from "./types";

describe("findDuplicates", () => {
  it("links a booking confirmation to its final folio and keeps the folio primary", () => {
    const candidates: DedupCandidate[] = [
      {
        id: "conf",
        vendor: "Fairmont Royal York",
        amount: 640,
        currency: "CAD",
        serviceDate: new Date("2026-01-14T00:00:00Z"),
        gmailThreadId: "thread-1",
        emailSubject: "Your reservation is confirmed - Fairmont Royal York",
        isFinalDocument: false,
      },
      {
        id: "folio",
        vendor: "Fairmont Royal York",
        amount: 612.4,
        currency: "CAD",
        serviceDate: new Date("2026-01-16T00:00:00Z"),
        gmailThreadId: "thread-1",
        emailSubject: "Your Fairmont Royal York folio",
        isFinalDocument: true,
      },
    ];

    const groups = findDuplicates(candidates);
    expect(groups).toHaveLength(1);
    expect(groups[0].primaryId).toBe("folio");
    expect(groups[0].supportingIds).toEqual(["conf"]);
  });

  it("matches on identical invoice number even with different subjects", () => {
    const candidates: DedupCandidate[] = [
      {
        id: "a",
        vendor: "VIA Rail",
        amount: 168.5,
        currency: "CAD",
        invoiceNumber: "VIA-7742199",
        serviceDate: new Date("2026-05-08T00:00:00Z"),
        emailSubject: "Your itinerary",
        isFinalDocument: false,
      },
      {
        id: "b",
        vendor: "VIA Rail",
        amount: 168.5,
        currency: "CAD",
        invoiceNumber: "VIA-7742199",
        serviceDate: new Date("2026-05-08T00:00:00Z"),
        emailSubject: "Your e-ticket receipt",
        isFinalDocument: true,
      },
    ];

    const groups = findDuplicates(candidates);
    expect(groups).toHaveLength(1);
    expect(groups[0].primaryId).toBe("b");
  });

  it("does not merge unrelated expenses from different vendors", () => {
    const candidates: DedupCandidate[] = [
      {
        id: "a",
        vendor: "Hertz",
        amount: 200,
        currency: "CAD",
        serviceDate: new Date("2026-02-12T00:00:00Z"),
        emailSubject: "Your Hertz Rental Receipt",
        isFinalDocument: true,
      },
      {
        id: "b",
        vendor: "Avis",
        amount: 200,
        currency: "CAD",
        serviceDate: new Date("2026-02-12T00:00:00Z"),
        emailSubject: "Your Avis Rental Receipt",
        isFinalDocument: true,
      },
    ];

    expect(findDuplicates(candidates)).toHaveLength(0);
  });

  it("does not merge same-vendor expenses that are far apart in time and amount", () => {
    const candidates: DedupCandidate[] = [
      {
        id: "jan",
        vendor: "Uber",
        amount: 38.42,
        currency: "CAD",
        serviceDate: new Date("2026-01-15T00:00:00Z"),
        emailSubject: "Your Tuesday trip with Uber",
        isFinalDocument: true,
      },
      {
        id: "apr",
        vendor: "Uber",
        amount: 22.1,
        currency: "CAD",
        serviceDate: new Date("2026-04-09T00:00:00Z"),
        emailSubject: "Your Thursday trip with Uber",
        isFinalDocument: true,
      },
    ];

    expect(findDuplicates(candidates)).toHaveLength(0);
  });
});
