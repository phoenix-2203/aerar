import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (Fontsource files), so builds never depend on Google Fonts.
// Geist for text, Bricolage Grotesque for headings, Geist Mono for numbers, ids and ledger lines.
const sans = localFont({
  src: "../../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const display = localFont({
  src: "../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});

const mono = localFont({
  src: "../../node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains",
  weight: "100 900",
  display: "swap",
});

const SITE = process.env.AERAR_PUBLIC_URL || "https://aerar.duckdns.org";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Aerar · the night-shift ledger for AI agents that spend money", template: "%s · Aerar" },
  description:
    "Aerar checks every x402 purchase an AI agent makes against its task, reuses what was already bought, holds big ones for a person, pays in USDC on Base and proves it onchain.",
  applicationName: "Aerar",
  openGraph: { type: "website", siteName: "Aerar", url: SITE },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0d18" },
    { media: "(prefers-color-scheme: light)", color: "#f7f6f1" },
  ],
};

// Runs before first paint: theme = saved choice, else system, else dark.
const THEME_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem("aerar-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}d.dataset.theme=t}catch(e){d.dataset.theme="dark"}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="relative isolate flex min-h-full flex-col overflow-x-clip">{children}</body>
    </html>
  );
}
