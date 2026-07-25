// Groups candidate expenses that likely represent the same underlying
// purchase (e.g. a hotel booking confirmation and its final folio) so only
// one is counted toward totals. The most authoritative document (final
// invoice/receipt over a confirmation/hold) is kept as primary; the rest are
// linked as supporting records.

import type { CancellationMatch, DedupCandidate, DuplicateGroup } from "./types";

function normalizeVendor(vendor: string): string {
  return vendor.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b(re|fwd|your|receipt|invoice|confirmation)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function daysApart(a?: Date | null, b?: Date | null): number {
  if (!a || !b) return Infinity;
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function sameThreadOrSimilarSubject(a: DedupCandidate, b: DedupCandidate): boolean {
  if (a.gmailThreadId && b.gmailThreadId && a.gmailThreadId === b.gmailThreadId) {
    return true;
  }
  const subjA = normalizeSubject(a.emailSubject);
  const subjB = normalizeSubject(b.emailSubject);
  if (!subjA || !subjB) return false;
  // Cheap similarity: shares most significant words.
  const wordsA = new Set(subjA.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(subjB.split(" ").filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  const shared = [...wordsA].filter((w) => wordsB.has(w));
  const overlap = shared.length / Math.min(wordsA.size, wordsB.size);
  return overlap >= 0.6;
}

// Two amounts are "similar" (rather than exactly equal) for hotel-stay
// matching: a reservation's estimated total rarely matches the final
// invoice exactly once taxes/fees/incidentals are added, and a missing
// amount (0) can't be compared numerically at all.
function amountsSimilar(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return true;
  const diff = Math.abs(a - b);
  return diff / Math.max(a, b) <= 0.35;
}

function sameHotelStay(a: DedupCandidate, b: DedupCandidate): boolean {
  if (!a.hotelCheckIn || !b.hotelCheckIn) return false;
  if (daysApart(a.hotelCheckIn, b.hotelCheckIn) > 1) return false;
  if (a.hotelCheckOut && b.hotelCheckOut && daysApart(a.hotelCheckOut, b.hotelCheckOut) > 1) return false;
  return true;
}

function isLikelyDuplicate(a: DedupCandidate, b: DedupCandidate): { match: boolean; reason: string } {
  if (normalizeVendor(a.vendor) !== normalizeVendor(b.vendor)) {
    return { match: false, reason: "" };
  }

  if (a.invoiceNumber && b.invoiceNumber && a.invoiceNumber === b.invoiceNumber) {
    return { match: true, reason: `Same invoice/confirmation number (${a.invoiceNumber}).` };
  }

  if (a.attachmentFilename && b.attachmentFilename && a.attachmentFilename === b.attachmentFilename) {
    return { match: true, reason: `Same attachment filename (${a.attachmentFilename}).` };
  }

  const sameAmount = Math.abs(a.amount - b.amount) < 0.01 && a.currency === b.currency;
  const closeInTime = daysApart(a.serviceDate, b.serviceDate) <= 3;
  const relatedThread = sameThreadOrSimilarSubject(a, b);

  if (relatedThread && (sameAmount || closeInTime)) {
    return {
      match: true,
      reason: "Same email thread / similar subject with matching amount or nearby service date.",
    };
  }

  if (sameAmount && closeInTime) {
    return {
      match: true,
      reason: "Same vendor, amount, currency, and service date within 3 days.",
    };
  }

  // Hotel-specific fallback: match a reservation confirmation to its final
  // invoice/folio by stay dates plus a similar amount or matching guest
  // name, per the "hotel name, city, check-in/out, guest name, similar
  // amount" matching rule.
  if (sameHotelStay(a, b)) {
    const sameGuest = !!(a.guestName && b.guestName && a.guestName.toLowerCase() === b.guestName.toLowerCase());
    if (sameGuest || amountsSimilar(a.amount, b.amount)) {
      return {
        match: true,
        reason: "Same hotel stay (matching check-in/check-out dates) with a similar amount or matching guest name.",
      };
    }
  }

  return { match: false, reason: "" };
}

export function findDuplicates(candidates: DedupCandidate[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    if (assigned.has(a.id)) continue;

    const cluster: { candidate: DedupCandidate; reason: string }[] = [{ candidate: a, reason: "" }];

    for (let j = i + 1; j < candidates.length; j++) {
      const b = candidates[j];
      if (assigned.has(b.id)) continue;
      const { match, reason } = isLikelyDuplicate(a, b);
      if (match) {
        cluster.push({ candidate: b, reason });
      }
    }

    if (cluster.length > 1) {
      // Prefer the final document; break ties by later service date.
      const primary = cluster.reduce((best, cur) => {
        if (cur.candidate.isFinalDocument !== best.candidate.isFinalDocument) {
          return cur.candidate.isFinalDocument ? cur : best;
        }
        const bestDate = best.candidate.serviceDate?.getTime() ?? 0;
        const curDate = cur.candidate.serviceDate?.getTime() ?? 0;
        return curDate > bestDate ? cur : best;
      });

      const supporting = cluster.filter((c) => c.candidate.id !== primary.candidate.id);
      supporting.forEach((s) => assigned.add(s.candidate.id));
      assigned.add(primary.candidate.id);

      groups.push({
        primaryId: primary.candidate.id,
        supportingIds: supporting.map((s) => s.candidate.id),
        reason:
          supporting.find((s) => s.reason)?.reason ??
          "Matched on vendor, amount, currency, and nearby service date.",
      });
    }
  }

  return groups;
}

// Matches "possible cancellation" emails to the hotel reservation
// confirmation they most likely refer to, using the same confirmation
// number first / stay-dates+amount fallback matching rule as findDuplicates.
// Each cancellation matches at most one reservation, and each reservation
// is matched at most once (first match wins).
export function findCancellationMatches(
  cancellations: DedupCandidate[],
  reservations: DedupCandidate[],
): CancellationMatch[] {
  const matches: CancellationMatch[] = [];
  const usedReservations = new Set<string>();

  for (const cancellation of cancellations) {
    for (const reservation of reservations) {
      if (usedReservations.has(reservation.id)) continue;
      if (normalizeVendor(cancellation.vendor) !== normalizeVendor(reservation.vendor)) continue;

      if (cancellation.invoiceNumber && reservation.invoiceNumber && cancellation.invoiceNumber === reservation.invoiceNumber) {
        matches.push({
          reservationId: reservation.id,
          cancellationId: cancellation.id,
          reason: `Same confirmation number (${cancellation.invoiceNumber}).`,
        });
        usedReservations.add(reservation.id);
        break;
      }

      if (sameHotelStay(cancellation, reservation)) {
        matches.push({
          reservationId: reservation.id,
          cancellationId: cancellation.id,
          reason: "Same hotel stay (matching check-in/check-out dates).",
        });
        usedReservations.add(reservation.id);
        break;
      }

      if (daysApart(cancellation.serviceDate, reservation.serviceDate) <= 3 && amountsSimilar(cancellation.amount, reservation.amount)) {
        matches.push({
          reservationId: reservation.id,
          cancellationId: cancellation.id,
          reason: "Same vendor with a nearby service date and similar amount.",
        });
        usedReservations.add(reservation.id);
        break;
      }
    }
  }

  return matches;
}
