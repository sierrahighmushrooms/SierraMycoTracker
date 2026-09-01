import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import ServiceWorkerCleanup from "@/components/ServiceWorkerCleanup";
import "./globals.css";

const SITE_URL = "https://sierramycolab.com";
const SITE_TITLE = "Sierra Myco Lab — Modern Mushroom Cultivation & Diagnostics";
const SITE_DESCRIPTION =
  "The complete mycology workflow platform — batch lineage tracking, sterilization logs, yield analytics, and AI diagnostics. Cloud-synced across all your devices.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "Sierra Myco Lab",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Sierra Myco Lab",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🍄</text></svg>",
  },
};

export const viewport: Viewport = {
  themeColor: "#030508",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-[#030508] text-slate-100 antialiased selection:bg-amber-500 selection:text-black font-sans">
        <ServiceWorkerCleanup />
        {children}
      </body>
    </html>
  );
}
