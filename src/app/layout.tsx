import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OPPAC Analysis — Option Chain & Spot Match",
  description: "Standalone NIFTY/BANKNIFTY option chain with Spot Match analysis.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <meta name="app-version" content="update-test-v1" />
      <body className="flex h-full flex-col">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
