import { NextResponse } from "next/server";
import { createOAuthClient, GMAIL_READONLY_SCOPE } from "@/lib/googleAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const client = createOAuthClient();
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_READONLY_SCOPE],
  });
  return NextResponse.redirect(url);
}
