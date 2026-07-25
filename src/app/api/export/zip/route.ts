import { NextRequest, NextResponse } from "next/server";
import archiver from "archiver";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { serializeExpense } from "@/lib/data";
import { expensesToCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

// Bundles the confirmed-expense CSV summary together with any locally
// cached receipt attachments into a single ZIP for download.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const year = Number(sp.get("year") ?? "2026");
  const month = sp.get("month") ? Number(sp.get("month")) : null;

  const expenses = await prisma.expense.findMany({
    where: { year, status: "CONFIRMED", ...(month ? { month } : {}) },
    include: { attachments: true, primaryDuplicates: { include: { supportingExpense: true } } },
    orderBy: [{ month: "asc" }, { serviceDate: "asc" }],
  });

  const serialized = expenses.map(serializeExpense);
  const csv = expensesToCsv(serialized);
  const namePrefix = month ? `${year}-${String(month).padStart(2, "0")}` : `${year}`;

  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = new PassThrough();
  archive.pipe(stream);

  archive.append(csv, { name: `${namePrefix}-business-expenses.csv` });

  for (const e of expenses) {
    for (const a of e.attachments) {
      if (a.localPath && fs.existsSync(a.localPath)) {
        archive.file(a.localPath, { name: `receipts/${e.vendor}-${a.filename}` });
      } else {
        archive.append(
          `No locally cached receipt file is available for this expense.\nVendor: ${e.vendor}\nGmail message: ${e.gmailMessageId}\n`,
          { name: `receipts/${e.vendor}-${a.filename}.MISSING.txt` },
        );
      }
    }
  }

  archive.finalize();

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(chunk as Buffer));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  const buffer = Buffer.concat(chunks);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${namePrefix}-business-expense-receipts.zip"`,
    },
  });
}
