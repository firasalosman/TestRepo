// Builds a link that opens a specific message directly in the Gmail web UI.
// Used both server-side (CSV export, API responses) and client-side (the
// "Link to Email" field / "Open in Gmail" button).
export function buildGmailLink(gmailMessageId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${gmailMessageId}`;
}
