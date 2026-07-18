import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

/**
 * /sitemap.xml — convention Next.js, statique et déterministe.
 *
 * Uniquement les pages PUBLIQUES dont le canonical se référence lui-même
 * (vérifié page par page) : jamais de route protégée, d'API, de token ni
 * d'UUID. Pas de `lastModified` : aucune date fiable liée au contenu n'est
 * maintenue en code, et une date artificielle serait trompeuse.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();

  return [
    {
      url: siteUrl,
      changeFrequency: "weekly",
      priority: 1,
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
}
