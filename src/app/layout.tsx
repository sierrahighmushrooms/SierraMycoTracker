import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Sierra Myco Lab — Modern Mushroom Cultivation & Diagnostics",
  description:
    "Sierra Myco Lab is the complete mycology workflow platform — batch lineage tracking, sterilization logs, yield analytics, and AI diagnostics.",
  keywords: [
    "mushroom cultivation",
    "mycology software",
    "batch tracking",
    "AI mycology",
    "sterilization logs",
    "spore to harvest",
    "Sierra Myco Lab",
  ],
  icons: {
    icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🍄</text></svg>",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-[#080b11] text-slate-100 antialiased selection:bg-amber-500 selection:text-black font-sans">
        {children}
      </body>
    </html>
  );
}
