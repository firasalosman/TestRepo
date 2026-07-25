import { NextResponse } from "next/server";
import { runSync } from "@/lib/sync";
import { isAuthenticated } from "@/lib/session";
import { logger } from "@/lib/logger";

export async function POST() {
  if (process.env.DATA_MODE !== "gmail") {
    return NextResponse.json({ error: "DATA_MODE is not set to \"gmail\". Sync is disabled in mock mode." }, { status: 400 });
  }
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not connected to Gmail. Connect first." }, { status: 401 });
  }

  try {
    const summary = await runSync(2026);
    return NextResponse.json(summary);
  } catch (err) {
    logger.error("sync_failed", { message: err instanceof Error ? err.message : "unknown" });
    return NextResponse.json({ error: "Sync failed. See server logs." }, { status: 500 });
  }
}
