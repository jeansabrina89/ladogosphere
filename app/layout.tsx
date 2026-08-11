import type { Metadata, Viewport } from "next";
import { Nunito_Sans } from "next/font/google";
import "./globals.css";
import RegisterSW from "./RegisterSW";

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-nunito-sans",
  display: "swap",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "La Dogosphère — Pension Canine",
  description: "Gestion de pension canine à Sion, Valais",
  icons: { icon: "/favicon-32.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "La Dogosphère" },
};

export const viewport: Viewport = {
  themeColor: "#4AAEA0",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={nunitoSans.variable}>
      <body>
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
