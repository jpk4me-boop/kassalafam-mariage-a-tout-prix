import type { MetadataRoute } from "next";

/**
 * Manifeste PWA (convention Next.js — servi sur /manifest.webmanifest et
 * référencé automatiquement dans le <head>, sans <link> manuel).
 * Icônes générées par `npm run generate:icons` depuis public/brand/.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KASSALAFAM — Mariage à Tout Prix",
    short_name: "KASSALAFAM",
    description:
      "KASSALAFAM — MARIAGE À TOUT PRIX aide les Africains à faire des rencontres sincères, vérifiées et orientées vers un vrai projet de foyer. Profils vérifiés, confidentialité protégée, modération stricte.",
    start_url: "/",
    id: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "fr",
    dir: "ltr",
    background_color: "#fdf8ef",
    theme_color: "#6b3f2a",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
