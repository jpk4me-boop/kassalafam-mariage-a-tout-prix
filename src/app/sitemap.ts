import type { MetadataRoute } from "next";

import { listPublicCandidateShowcaseSitemap } from "@/lib/server/public-candidate-showcase";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /sitemap.xml — pages publiques à canonical propre + fiches candidates encore
 * effectivement publiables au moment de la requête.
 *
 * Les routes candidates sont obtenues par une RPC service_role dédiée qui ne
 * retourne que le slug opaque et last_modified. En cas d'incident Supabase, le
 * helper échoue fermé : le sitemap statique reste disponible mais aucune fiche
 * candidate potentiellement obsolète n'est énumérée.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const candidates = await listPublicCandidateShowcaseSitemap();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/candidats`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/partager`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/aide`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/confidentialite`,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${siteUrl}/conditions-utilisation`,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${siteUrl}/mentions-legales`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/cookies`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const candidateEntries: MetadataRoute.Sitemap = candidates.map((candidate) => ({
    url: `${siteUrl}/candidats/${candidate.slug}`,
    lastModified: candidate.lastModified,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticEntries, ...candidateEntries];
}
