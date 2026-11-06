import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (Fontsource files), so builds never depend on Google Fonts.
const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const jetbrains = localFont({
  src: "../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains",
  weight: "100 800",
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
    { media: "(prefers-color-scheme: dark)", color: "#0a0d14" },
    { media: "(prefers-color-scheme: light)", color: "#f6f6f3" },
  ],
};

// Runs before first paint: the saved choice, else the system preference, else dark.
const THEME_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem("aerar-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}d.dataset.theme=t}catch(e){d.dataset.theme="dark"}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
