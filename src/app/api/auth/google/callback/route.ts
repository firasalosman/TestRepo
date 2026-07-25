import { NextRequest, NextResponse } from "next/server";
import { createOAuthClient, saveTokens } from "@/lib/googleAuth";
import { createSession } from "@/lib/session";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    logger.warn("oauth_callback_error", { error });
    return NextResponse.redirect(new URL("/?gmail_error=1", req.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/?gmail_error=1", req.url));
  }

  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);
    await saveTokens(tokens);
    await createSession();
    logger.info("oauth_callback_success");
  } catch (err) {
    logger.error("oauth_callback_failed", { message: err instanceof Error ? err.message : "unknown" });
    return NextResponse.redirect(new URL("/?gmail_error=1", req.url));
  }

  return NextResponse.redirect(new URL("/?gmail_connected=1", req.url));
}
