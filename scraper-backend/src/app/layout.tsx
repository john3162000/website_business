import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scraper Backend — Static Data Pipeline",
  description: "Admin pipeline for scraping DA prices, Panlasang Pinoy recipes, and FNRI nutrition data into static snapshots.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
