// Google OAuth client configuration. Requests ONLY the read-only Gmail
// scope - this app must never request send/modify/delete permissions.

import { google } from "googleapis";
import { prisma } from "./prisma";
import { encrypt, decrypt } from "./crypto";
import { logger } from "./logger";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env.",
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function saveTokens(tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null }) {
  const existing = await prisma.oAuthToken.findUnique({ where: { id: "singleton" } });

  // Google only returns a refresh_token on the first consent; preserve the
  // previously stored one on subsequent logins/refreshes if a new one isn't issued.
  let refreshToken = tokens.refresh_token;
  if (!refreshToken && existing) {
    const previous = JSON.parse(decrypt(existing.encryptedBlob));
    refreshToken = previous.refresh_token;
  }

  const payload = JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: refreshToken,
    expiry_date: tokens.expiry_date,
  });

  await prisma.oAuthToken.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", encryptedBlob: encrypt(payload), scope: GMAIL_READONLY_SCOPE },
    update: { encryptedBlob: encrypt(payload), scope: GMAIL_READONLY_SCOPE },
  });

  logger.info("oauth_tokens_saved");
}

export async function getAuthorizedClient() {
  const record = await prisma.oAuthToken.findUnique({ where: { id: "singleton" } });
  if (!record) return null;

  const tokens = JSON.parse(decrypt(record.encryptedBlob));
  const client = createOAuthClient();
  client.setCredentials(tokens);

  client.on("tokens", (newTokens) => {
    // Persist refreshed access tokens so we don't re-prompt the user.
    saveTokens({ ...tokens, ...newTokens }).catch((err) =>
      logger.error("oauth_token_refresh_save_failed", { message: err instanceof Error ? err.message : "unknown" }),
    );
  });

  return client;
}

export async function revokeAndClearTokens() {
  const record = await prisma.oAuthToken.findUnique({ where: { id: "singleton" } });
  if (record) {
    try {
      const tokens = JSON.parse(decrypt(record.encryptedBlob));
      const client = createOAuthClient();
      if (tokens.access_token) {
        await client.revokeToken(tokens.access_token);
      }
    } catch (err) {
      logger.warn("oauth_revoke_failed", { message: err instanceof Error ? err.message : "unknown" });
    }
  }
  await prisma.oAuthToken.deleteMany();
  logger.info("oauth_tokens_cleared");
}
