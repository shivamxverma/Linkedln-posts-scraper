import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Board",
  description: "Browse scraped jobs from the database.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
