import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

/**
 * /robots.txt — convention Next.js, générée au build (aucun accès réseau).
 *
 * `disallow` est dérivé de l'inventaire RÉEL des routes du dépôt : espaces
 * membre et admin, API, authentification, onboarding, et les liens publics
 * limités de profils `/p/<token>` (déjà `noindex`, exclus par défense en
 * profondeur). Le préfixe « /p/ » (avec slash final) ne bloque PAS /partager.
 * Les images sociales (/opengraph-image, /twitter-image) et les assets QR
 * restent volontairement accessibles aux robots.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/dashboard",
        "/profile",
        "/discover",
        "/matches",
        "/onboarding",
        "/p/",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
