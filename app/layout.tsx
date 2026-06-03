import type { Metadata } from "next";
import "./globals.css";
import NavBarServeur from "./components/NavBarServeur";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "La Dogosphère — Pension Canine",
  description: "Gestion de pension canine à Sion, Valais",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        <NavBarServeur />
        {children}
      </body>
    </html>
  );
}