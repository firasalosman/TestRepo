import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Merged audit-history timeline for one expense: structured AuditLog entries
// (status/category/month changes, individual or bulk) plus the free-text
// AuditNote entries already used for system classification notes and
// merge/dedup notes, sorted newest first.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const [logs, notes] = await Promise.all([
    prisma.auditLog.findMany({ where: { expenseId: params.id }, orderBy: { createdAt: "desc" } }),
    prisma.auditNote.findMany({ where: { expenseId: params.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const timeline = [
    ...logs.map((l) => ({
      id: l.id,
      type: "STRUCTURED" as const,
      actionType: l.actionType,
      previousValues: JSON.parse(l.previousValues),
      newValues: JSON.parse(l.newValues),
      reason: l.reason,
      performedBy: l.performedBy,
      isBulk: l.isBulk,
      bulkActionId: l.bulkActionId,
      createdAt: l.createdAt.toISOString(),
    })),
    ...notes.map((n) => ({
      id: n.id,
      type: "NOTE" as const,
      note: n.note,
      source: n.source,
      createdAt: n.createdAt.toISOString(),
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(timeline);
}
