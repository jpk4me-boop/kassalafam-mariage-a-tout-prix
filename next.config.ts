import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Serveur Node autonome (.next/standalone) pour l'image Docker Coolify. */
  output: "standalone",
  async headers() {
    return [
      {
        /* Le navigateur doit revalider sw.js à chaque visite : un service
           worker mis en cache longtemps retarderait toute mise à jour. */
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
