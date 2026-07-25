import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <p>
        <Link href="/">&larr; Back to dashboard</Link>
      </p>
      <h1>Privacy Notice</h1>
      <p className="muted">
        This application is for your personal, single-user use only. It is not a hosted service and
        is not intended to be deployed for anyone other than the account owner running it locally.
      </p>

      <h2>What is accessed</h2>
      <ul>
        <li>
          Gmail metadata and message content (subject, sender, body, and attachments) for messages
          matched by the expense-search queries within the configured date range, using a
          read-only Gmail OAuth scope (<code>gmail.readonly</code>).
        </li>
        <li>This application never requests permission to send, delete, archive, or label email.</li>
      </ul>

      <h2>What is stored locally</h2>
      <ul>
        <li>Extracted expense fields (vendor, dates, amounts, currency, category, confidence score).</li>
        <li>Gmail message and thread IDs (used to locate the original email and avoid reprocessing).</li>
        <li>Attachment metadata, and optionally a locally cached copy of receipt attachments.</li>
        <li>Only the last four digits of any payment card mentioned in a receipt — never the full number.</li>
        <li>OAuth tokens, encrypted at rest, used solely to call the Gmail API on your behalf.</li>
      </ul>

      <h2>What is not stored</h2>
      <ul>
        <li>Your Google account password (Google OAuth never shares this with the app).</li>
        <li>Full payment card numbers.</li>
      </ul>

      <h2>Third parties</h2>
      <p>
        By default, all processing (parsing, classification, extraction) happens locally within this
        application. No email content, receipts, or extracted financial data are sent to any
        third-party service unless you explicitly set <code>AI_ASSISTED_EXTRACTION_ENABLED=true</code>{" "}
        and configure a provider — a setting that is off by default and documented in{" "}
        <code>.env.example</code>.
      </p>

      <h2>Your controls</h2>
      <ul>
        <li>Revoke Gmail access at any time from your Google Account security settings, or use the logout/revoke option in this app.</li>
        <li>Use the &ldquo;Delete all local data&rdquo; button on the dashboard to permanently erase the local database.</li>
      </ul>
    </div>
  );
}
