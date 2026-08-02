import { getPublicCandidateShowcasePhoto } from "@/lib/server/public-candidate-showcase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Photo de la VITRINE PUBLIQUE `/candidats` — en-têtes volontairement
 * différents de ceux du partage privé `/p/[token]/photo` et de la promotion
 * `/promo/[token]/photo`, qui restent verrouillés.
 *
 * Cette photo est publiée sur consentement explicite, sur une page elle-même
 * indexable (`robots: index, follow`). Les en-têtes `no-store` et
 * `noarchive` empêchaient les robots sociaux de constituer l'aperçu : une
 * publication Facebook n'affichait qu'une URL nue, sans image ni titre.
 *
 * Conséquence assumée et annoncée au membre : une image récupérée par une
 * plateforme sociale peut rester quelques jours dans SON cache après un
 * retrait de consentement. Le site, lui, cesse immédiatement de la servir
 * (404), et la page publique disparaît dans la seconde.
 */
const BASE_HEADERS: Record<string, string> = {
  // Cache court : les aperçus sociaux ont besoin de récupérer l'image, mais
  // un retrait de consentement doit se propager vite.
  "Cache-Control": "public, max-age=300, s-maxage=300",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  // Autorise les plateformes sociales à charger la ressource.
  "Cross-Origin-Resource-Policy": "cross-origin",
};

/** Les réponses 404 ne doivent jamais être mises en cache ni archivées. */
const NOT_FOUND_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Robots-Tag": "noindex, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function emptyNotFound(): Response {
  return new Response(null, { status: 404, headers: NOT_FOUND_HEADERS });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const photo = await getPublicCandidateShowcasePhoto(slug);
  if (!photo) return emptyNotFound();

  return new Response(photo.body, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.body.byteLength),
      "Content-Disposition": "inline",
    },
  });
}
