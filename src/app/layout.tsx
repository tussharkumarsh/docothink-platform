import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { publicEnv } from "@/lib/env";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: { default: "Docothink — Online doctor consultations", template: "%s · Docothink" },
  description:
    "Consult verified doctors online by chat, audio or video. Book in your own time zone, keep your records and prescriptions in one secure place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
