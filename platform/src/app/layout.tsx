import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SarapSulit — Best Filipino Dishes by Nutrition & Price",
  description:
    "Find the most nutritious Filipino dishes for your budget, powered by DA market prices, Panlasang Pinoy recipes, and FNRI nutritional data.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-amber-50 text-gray-900">
        <Nav />
        <main className="flex-1">{children}</main>
        <footer className="bg-green-900 text-green-100 text-center py-6 text-sm mt-8">
          <p>Data sources: DA Price Monitoring · Panlasang Pinoy · FNRI Food Composition Table</p>
          <p className="mt-1 text-green-300">SarapSulit — Masarap, Masustansya, Sulit!</p>
        </footer>
      </body>
    </html>
  );
}
