import type { Metadata } from "next";

import "../styles/index.css";

export const metadata: Metadata = {
  applicationName: "AyudAPI",
  description:
    "Tu información médica disponible en el minuto que más importa. QR de emergencia, contactos ICE y datos críticos.",
  title: "AyudAPI · Sistema de asistencia médica de emergencia",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}