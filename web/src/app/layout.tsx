import type { Metadata, Viewport } from "next";
import { Sora, Geist_Mono, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { INTRO_DECIDE } from "@/components/intro/markup";

const sora = Sora({ variable: "--font-sora", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// a condensed, kit-lettering face for league names on the cards
const display = Barlow_Condensed({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: "elevn: $ELEVN fantasy football",
  description: "Hold $ELEVN, pick real players, score live and win SOL.",
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = { themeColor: "#0a0b0d", width: "device-width", initialScale: 1 };


export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Decide before the first paint whether the home-page intro plays (first visit this session,
            no reduced motion), so the page opens straight on the video. See components/intro/Intro.tsx. */}
        <script dangerouslySetInnerHTML={{ __html: INTRO_DECIDE }} />
      </head>
      {/* Browser extensions (e.g. Grammarly) add attributes to <body> before React loads; ignore those. */}
      <body suppressHydrationWarning className={`${sora.variable} ${geistMono.variable} ${display.variable} font-sans antialiased min-h-screen overflow-x-clip`}>
        {children}
      </body>
    </html>
  );
}
