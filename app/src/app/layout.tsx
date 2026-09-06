import type { Metadata, Viewport } from "next";

import { AppProviders } from "./providers";
import { brand, products } from "@/lib/copy/phygital";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: brand.company,
    template: `%s — ${brand.company}`,
  },
  description: products.home.tagline,
  applicationName: brand.company,
  appleWebApp: {
    capable: true,
    title: brand.company,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: brand.chromeLight },
    { media: "(prefers-color-scheme: dark)", color: brand.chromeDark },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="min-h-dvh antialiased">
      <body className="flex min-h-dvh flex-col font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
