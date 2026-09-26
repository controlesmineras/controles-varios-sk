import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "CONTROL EXPLOSIVOS SK",
  description: "Control de inventario, ubicación y sellos de seguridad.",
  manifest: "/controles-varios-sk/manifest.webmanifest?v=5",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "EXPLOSIVOS SK" },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/controles-varios-sk/favicon.svg?v=5",
    shortcut: "/controles-varios-sk/favicon.svg?v=5",
    apple: "/controles-varios-sk/icon-192.png?v=5",
  },
};

export const viewport: Viewport = { themeColor: "#0d2c3e" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased"><Script src="/controles-varios-sk/install-prompt.js?v=1" strategy="beforeInteractive" /><Script src="/controles-varios-sk/config.js?v=20260920-2" strategy="beforeInteractive" />{children}</body>
    </html>
  );
}
