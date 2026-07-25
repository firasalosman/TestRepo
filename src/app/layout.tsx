import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Business Expense Tracker",
  description: "Personal Gmail-based business expense tracker for 2026.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
