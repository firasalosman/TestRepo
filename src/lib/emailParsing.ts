// Extracts plain text, HTML, and attachment metadata out of a Gmail API
// "full" format message, and turns attachment bytes into searchable text
// where practical (PDF, HTML, plain text). Images are not OCR'd - they are
// recorded with empty extracted text and rely on the email body / low
// confidence + manual review.

import type { gmail_v1 } from "googleapis";
import * as cheerio from "cheerio";

export interface ParsedAttachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
  sizeEstimate?: number | null;
}

export interface ParsedMessage {
  subject: string;
  sender: string;
  bodyText: string;
  attachments: ParsedAttachment[];
}

function decodeBase64Url(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  const header = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value ?? "";
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  return $.root().text().replace(/\s+/g, " ").trim();
}

export function parseMessage(message: gmail_v1.Schema$Message): ParsedMessage {
  const payload = message.payload;
  const subject = getHeader(payload?.headers, "Subject");
  const sender = getHeader(payload?.headers, "From");

  const textChunks: string[] = [];
  const attachments: ParsedAttachment[] = [];

  function walk(part: gmail_v1.Schema$MessagePart | undefined) {
    if (!part) return;

    if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        attachmentId: part.body.attachmentId,
        sizeEstimate: part.body.size,
      });
      return;
    }

    if (part.mimeType === "text/plain" && part.body?.data) {
      textChunks.push(decodeBase64Url(part.body.data).toString("utf8"));
    } else if (part.mimeType === "text/html" && part.body?.data) {
      textChunks.push(htmlToText(decodeBase64Url(part.body.data).toString("utf8")));
    }

    for (const child of part.parts ?? []) {
      walk(child);
    }
  }

  walk(payload ?? undefined);

  // Single-part message (no `parts` array): body lives directly on payload.
  if (!payload?.parts && payload?.body?.data) {
    const raw = decodeBase64Url(payload.body.data).toString("utf8");
    textChunks.push(payload.mimeType === "text/html" ? htmlToText(raw) : raw);
  }

  return {
    subject,
    sender,
    bodyText: textChunks.join("\n").trim(),
    attachments,
  };
}

export async function extractAttachmentText(mimeType: string, buffer: Buffer): Promise<string> {
  try {
    if (mimeType === "application/pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      return result.text ?? "";
    }
    if (mimeType === "text/html") {
      return htmlToText(buffer.toString("utf8"));
    }
    if (mimeType.startsWith("text/")) {
      return buffer.toString("utf8");
    }
    // image/* and anything else: no local OCR implemented.
    return "";
  } catch {
    // Malformed/unreadable attachment - fall back to empty text; the
    // classifier will fall back to the email body and flag low confidence.
    return "";
  }
}
