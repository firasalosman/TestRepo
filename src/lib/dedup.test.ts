import { describe, expect, it } from "vitest";
import { findCancellationMatches, findDuplicates } from "./dedup";
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

  it("treats multiple VIA Rail emails on the same day with the same amount as duplicates", () => {
    const candidates: DedupCandidate[] = [
      {
        id: "itinerary",
        vendor: "VIA Rail",
        amount: 214.75,
        currency: "CAD",
        serviceDate: new Date("2026-09-18T00:00:00Z"),
        emailSubject: "Your VIA Rail itinerary update",
        isFinalDocument: false,
      },
      {
        id: "receipt",
        vendor: "VIA Rail",
        amount: 214.75,
        currency: "CAD",
        serviceDate: new Date("2026-09-18T00:00:00Z"),
        emailSubject: "Your VIA Rail e-ticket receipt",
        isFinalDocument: true,
      },
    ];

    const groups = findDuplicates(candidates);
    expect(groups).toHaveLength(1);
    expect(groups[0].primaryId).toBe("receipt");
    expect(groups[0].supportingIds).toEqual(["itinerary"]);
  });
});

describe("Marriott reservation confirmation matching", () => {
  it("matches a reservation confirmation to its later final invoice by stay dates, replacing it as authoritative", () => {
    const candidates: DedupCandidate[] = [
      {
        id: "reservation",
        vendor: "Marriott Downtown Ottawa",
        amount: 275,
        currency: "CAD",
        invoiceNumber: "MARCONF-70033",
        serviceDate: new Date("2026-08-20T00:00:00Z"),
        hotelCheckIn: new Date("2026-08-19T00:00:00Z"),
        hotelCheckOut: new Date("2026-08-20T00:00:00Z"),
        guestName: "Firas Alosman",
        emailSubject: "Your Reservation is Confirmed - Marriott Downtown Ottawa",
        isFinalDocument: false,
      },
      {
        id: "invoice",
        vendor: "Marriott Downtown Ottawa",
        amount: 298.6,
        currency: "CAD",
        invoiceNumber: "MAR-INV-99120",
        serviceDate: new Date("2026-08-20T00:00:00Z"),
        hotelCheckIn: new Date("2026-08-19T00:00:00Z"),
        hotelCheckOut: new Date("2026-08-20T00:00:00Z"),
        guestName: "Firas Alosman",
        emailSubject: "Your Marriott Downtown Ottawa Invoice",
        isFinalDocument: true,
      },
    ];

    const groups = findDuplicates(candidates);
    expect(groups).toHaveLength(1);
    expect(groups[0].primaryId).toBe("invoice");
    expect(groups[0].supportingIds).toEqual(["reservation"]);
  });

  it("leaves a reservation confirmation with no later invoice as its own standalone record", () => {
    const candidates: DedupCandidate[] = [
      {
        id: "reservation",
        vendor: "Courtyard by Marriott Toronto Downtown",
        amount: 342.5,
        currency: "CAD",
        invoiceNumber: "MARCONF-70011",
        serviceDate: new Date("2026-04-22T00:00:00Z"),
        hotelCheckIn: new Date("2026-04-21T00:00:00Z"),
        hotelCheckOut: new Date("2026-04-22T00:00:00Z"),
        guestName: "Firas Alosman",
        emailSubject: "Your Reservation is Confirmed - Courtyard by Marriott Toronto Downtown",
        isFinalDocument: false,
      },
    ];

    expect(findDuplicates(candidates)).toHaveLength(0);
  });

  it("matches multiple emails for the same Marriott stay to a single group with the final invoice as primary", () => {
    const candidates: DedupCandidate[] = [
      {
        id: "reservation",
        vendor: "Marriott Downtown Ottawa",
        amount: 275,
        currency: "CAD",
        serviceDate: new Date("2026-08-20T00:00:00Z"),
        hotelCheckIn: new Date("2026-08-19T00:00:00Z"),
        hotelCheckOut: new Date("2026-08-20T00:00:00Z"),
        emailSubject: "Your Reservation is Confirmed - Marriott Downtown Ottawa",
        isFinalDocument: false,
      },
      {
        id: "reminder",
        vendor: "Marriott Downtown Ottawa",
        amount: 275,
        currency: "CAD",
        serviceDate: new Date("2026-08-20T00:00:00Z"),
        hotelCheckIn: new Date("2026-08-19T00:00:00Z"),
        hotelCheckOut: new Date("2026-08-20T00:00:00Z"),
        emailSubject: "Reminder: Your upcoming stay at Marriott Downtown Ottawa",
        isFinalDocument: false,
      },
      {
        id: "invoice",
        vendor: "Marriott Downtown Ottawa",
        amount: 298.6,
        currency: "CAD",
        serviceDate: new Date("2026-08-20T00:00:00Z"),
        hotelCheckIn: new Date("2026-08-19T00:00:00Z"),
        hotelCheckOut: new Date("2026-08-20T00:00:00Z"),
        emailSubject: "Your Marriott Downtown Ottawa Invoice",
        isFinalDocument: true,
      },
    ];

    const groups = findDuplicates(candidates);
    expect(groups).toHaveLength(1);
    expect(groups[0].primaryId).toBe("invoice");
    expect(groups[0].supportingIds.sort()).toEqual(["reminder", "reservation"]);
  });
});

describe("findCancellationMatches", () => {
  it("matches a reservation to its cancellation by confirmation number", () => {
    const reservations: DedupCandidate[] = [
      {
        id: "reservation",
        vendor: "Marriott Downtown Vancouver",
        amount: 410,
        currency: "CAD",
        invoiceNumber: "MARCONF-70044",
        serviceDate: new Date("2026-10-15T00:00:00Z"),
        hotelCheckIn: new Date("2026-10-14T00:00:00Z"),
        hotelCheckOut: new Date("2026-10-15T00:00:00Z"),
        emailSubject: "Your Reservation is Confirmed - Marriott Downtown Vancouver",
        isFinalDocument: false,
      },
    ];
    const cancellations: DedupCandidate[] = [
      {
        id: "cancellation",
        vendor: "Marriott Downtown Vancouver",
        amount: 410,
        currency: "CAD",
        invoiceNumber: "MARCONF-70044",
        serviceDate: new Date("2026-10-02T00:00:00Z"),
        emailSubject: "Your Reservation Has Been Cancelled - Marriott Downtown Vancouver",
        isFinalDocument: false,
      },
    ];

    const matches = findCancellationMatches(cancellations, reservations);
    expect(matches).toHaveLength(1);
    expect(matches[0].reservationId).toBe("reservation");
    expect(matches[0].cancellationId).toBe("cancellation");
  });

  it("does not match a cancellation to a reservation for a different vendor", () => {
    const reservations: DedupCandidate[] = [
      {
        id: "reservation",
        vendor: "Marriott Downtown Vancouver",
        amount: 410,
        currency: "CAD",
        serviceDate: new Date("2026-10-15T00:00:00Z"),
        emailSubject: "Your Reservation is Confirmed - Marriott Downtown Vancouver",
        isFinalDocument: false,
      },
    ];
    const cancellations: DedupCandidate[] = [
      {
        id: "cancellation",
        vendor: "Fairmont Royal York",
        amount: 410,
        currency: "CAD",
        serviceDate: new Date("2026-10-02T00:00:00Z"),
        emailSubject: "Your Reservation Has Been Cancelled",
        isFinalDocument: false,
      },
    ];

    expect(findCancellationMatches(cancellations, reservations)).toHaveLength(0);
  });
});
