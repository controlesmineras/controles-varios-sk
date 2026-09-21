import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CONTROL EXPLOSIVOS SK",
  description: "Control de inventario, ubicación y sellos de seguridad.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
