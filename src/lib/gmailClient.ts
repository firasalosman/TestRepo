// Thin wrapper around the Gmail API (read-only). Every call here uses the
// `gmail.readonly` scope only - there is no code path in this file that can
// send, delete, archive, or label email.

import { google, gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { getAuthorizedClient } from "./googleAuth";

export function getGmailClient(auth: OAuth2Client): gmail_v1.Gmail {
  return google.gmail({ version: "v1", auth });
}

export async function requireGmailClient(): Promise<gmail_v1.Gmail> {
  const auth = await getAuthorizedClient();
  if (!auth) {
    throw new Error("Gmail is not connected. Complete Google OAuth first.");
  }
  return getGmailClient(auth);
}

export interface GmailListPage {
  messageIds: string[];
  nextPageToken?: string | null;
}

// Lists message IDs matching `query`, one page at a time (Gmail API default
// page size is small; we cap it explicitly to keep memory bounded).
export async function listMessagePage(
  gmail: gmail_v1.Gmail,
  query: string,
  pageToken?: string,
  maxResults = 25,
): Promise<GmailListPage> {
  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
    pageToken,
  });
  return {
    messageIds: (res.data.messages ?? []).map((m) => m.id!).filter(Boolean),
    nextPageToken: res.data.nextPageToken,
  };
}

export async function getFullMessage(gmail: gmail_v1.Gmail, messageId: string) {
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  return res.data;
}

export async function getAttachmentData(gmail: gmail_v1.Gmail, messageId: string, attachmentId: string) {
  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });
  return res.data.data ?? null; // base64url-encoded
}
