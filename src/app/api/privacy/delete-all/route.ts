import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function POST() {
  await prisma.duplicateLink.deleteMany();
  await prisma.auditNote.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.emailRecord.deleteMany();
  await prisma.syncState.deleteMany();
  await prisma.oAuthToken.deleteMany();

  logger.info("local_data_deleted");
  return NextResponse.json({ ok: true });
}
