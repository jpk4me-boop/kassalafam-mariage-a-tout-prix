import type { Metadata } from "next";

/**
 * Metadata partagée des pages PUBLIQUES indexables (aide, pages juridiques…).
 *
 * Chaque page publique doit porter son propre canonical et son propre og:url :
 * sans ce bloc, Next fait hériter ceux de la racine (« / »), ce qui a été
 * constaté en Production sur /aide. Les URL relatives sont résolues en absolu
 * par le `metadataBase` du layout racine (ne pas le dupliquer ici).
 *
 * Les images sociales sont les conventions racine existantes
 * (`opengraph-image.tsx` / `twitter-image.tsx`) : un bloc openGraph enfant ne
 * les hérite pas, il faut les redéclarer (même piège que /partager, PR #59).
 */

type PublicPageMetadataInput = {
  title: string;
  description: string;
  path: "/" | `/${string}`;
};

const SOCIAL_IMAGE_ALT = "KASSALAFAM — Rencontres sérieuses en vue du mariage";

export function buildPublicPageMetadata({
  title,
  description,
  path,
}: PublicPageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      url: path,
      type: "website",
      siteName: "KASSALAFAM",
      locale: "fr_FR",
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: SOCIAL_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/twitter-image"],
    },
  };
}
