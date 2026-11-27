import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { ToastProvider } from "@/components/feedback";
import "./globals.css";

// GEN-17 fonts: Fraunces for headings and branding, DM Sans for everything else.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Travel Planner",
  description: "Plan trips, book flights and hotels, and track your travel budget.",
};

// Explicit props type: the global LayoutProps helper only exists after `next dev`/`next build`
// generates it, and CI type-checks before building.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col"><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
