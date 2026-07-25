import { NextRequest, NextResponse } from "next/server";
import { createOAuthClient, saveTokens } from "@/lib/googleAuth";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from "@/lib/session";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

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

    const token = await createSessionToken();
    const response = NextResponse.redirect(new URL("/?gmail_connected=1", req.url));
    response.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);

    logger.info("oauth_callback_success");
    return response;
  } catch (err) {
    logger.error("oauth_callback_failed", { message: err instanceof Error ? err.message : "unknown" });
    return NextResponse.redirect(new URL("/?gmail_error=1", req.url));
  }
}
