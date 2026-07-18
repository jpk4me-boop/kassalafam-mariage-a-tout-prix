import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Layout serveur de /partager : porte UNIQUEMENT la metadata dédiée de la
 * page (la page reste un Client Component et ne peut pas exporter de
 * metadata). Aucun wrapper visuel. Les images sociales viennent des
 * conventions racine `opengraph-image.tsx` / `twitter-image.tsx`.
 */

export const metadata: Metadata = {
  title: "Partager KASSALAFAM — Mariage à Tout Prix",
  description:
    "Partagez KASSALAFAM et invitez une personne qui recherche une relation sérieuse en vue du mariage.",
  alternates: {
    canonical: "/partager",
  },
  openGraph: {
    title: "Partagez KASSALAFAM",
    description:
      "Un simple partage peut faire naître une belle rencontre sérieuse en vue du mariage.",
    url: "/partager",
    type: "website",
    // Redéclarées ici : le bloc openGraph d'un segment enfant remplace celui
    // du parent sans hériter des images de la convention racine.
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Partagez KASSALAFAM — Mariage à Tout Prix",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Partagez KASSALAFAM",
    description:
      "Invitez une personne qui recherche une relation sérieuse en vue du mariage.",
    images: ["/twitter-image"],
  },
};

export default function PartagerLayout({ children }: { children: ReactNode }) {
  return children;
}
