import { NextResponse } from "next/server";
import { revokeAndClearTokens } from "@/lib/googleAuth";
import { clearSession } from "@/lib/session";

// Logs out and revokes the Gmail OAuth grant with Google. Local expense
// data is NOT deleted by this - use "Delete all local data" for that.
export async function POST() {
  await revokeAndClearTokens();
  clearSession();
  return NextResponse.json({ ok: true });
}
