import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";

import { AppProviders } from "./providers";
import { brand } from "@/lib/copy/phygital";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.revibase.com";

export const metadata: Metadata = {
  metadataBase: new URL(APP_ORIGIN),
  title: {
    default: brand.company,
    template: `%s — ${brand.company}`,
  },
  description: brand.description,
  applicationName: brand.company,
  formatDetection: {
    telephone: false,
    date: false,
    email: false,
    address: false,
  },
  appleWebApp: {
    capable: true,
    title: brand.company,
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    siteName: brand.company,
    title: brand.company,
    description: brand.description,
  },
  twitter: {
    card: "summary_large_image",
    title: brand.company,
    description: brand.description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: brand.chromeLight,
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} min-h-dvh antialiased`}
      suppressHydrationWarning
    >
      <body
        className="flex min-h-dvh flex-col font-sans"
        suppressHydrationWarning
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
