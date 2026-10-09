import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { OfflineShell } from "@/components/offline-shell";

export const metadata: Metadata = {
  title: "CONTROL EXPLOSIVOS SK",
  description: "Control de inventario, ubicación y sellos de seguridad.",
  manifest: "/controles-varios-sk/manifest.webmanifest?v=20261007-2",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "EXPLOSIVOS SK" },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/controles-varios-sk/logo-mecha-32.png?v=20261007-2",
    shortcut: "/controles-varios-sk/logo-mecha-32.png?v=20261007-2",
    apple: "/controles-varios-sk/logo-mecha-192.png?v=20261007-2",
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
      <body className="antialiased"><Script src="/controles-varios-sk/install-prompt.js?v=1" strategy="beforeInteractive" /><Script src="/controles-varios-sk/config.js?v=20260920-2" strategy="beforeInteractive" /><OfflineShell />{children}</body>
    </html>
  );
}
