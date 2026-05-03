import "@/app/globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";

// Editorial display serif with high optical contrast — pulls toward the
// "financial document" feel that the audience trusts. Variable weight so we
// can pull the SOFT + opsz axes; CSS controls weight via font-weight.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz", "SOFT"],
  style: ["normal", "italic"],
});

// IBM Plex Sans — industrial, neutral, slightly grotesque body type. Pairs
// with Fraunces' editorial warmth without competing.
const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600"],
});

// JetBrains Mono for rule keys, status labels, section markers, anything
// that benefits from the "this is a real artifact, not marketing copy"
// signal that monospace conveys.
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Nevatas — payroll-to-401(k) operations",
  description:
    "Connect any payroll system to any 401(k) recordkeeper, validate the data, detect compliance risks, require sponsor approval, and preserve a complete audit trail.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${plex.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
