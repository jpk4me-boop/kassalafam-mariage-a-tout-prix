import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "KASSALAFAM — Mariage à Tout Prix | Rencontres sérieuses vérifiées",
  description:
    "KASSALAFAM — MARIAGE À TOUT PRIX aide les Africains à faire des rencontres sincères, vérifiées et orientées vers un vrai projet de foyer. Profils vérifiés, confidentialité protégée, modération stricte.",
  keywords: [
    "mariage",
    "rencontre sérieuse",
    "Afrique",
    "profil vérifié",
    "foyer",
    "KASSALAFAM",
  ],
  openGraph: {
    title: "KASSALAFAM — Mariage à Tout Prix",
    description:
      "La plateforme de mariage vérifiée, confidentielle et orientée foyer pour les Africains.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream-50 text-ink-800">
        {children}
      </body>
    </html>
  );
}
