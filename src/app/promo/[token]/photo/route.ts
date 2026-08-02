import { getPublicPromotedPhoto } from "@/lib/server/public-profile-promotion";

export const dynamic = "force-dynamic";

/**
 * Photo d'un lien de PROMOTION `/promo/[token]`.
 *
 * Ces liens existent POUR être publiés sur les réseaux sociaux : le membre
 * coche explicitement les canaux (Facebook, Instagram, Snapchat, WhatsApp) et
 * une durée (7, 30 ou 90 jours). Deux exigences coexistent donc, et elles ne
 * s'opposent pas :
 *
 *   - INVISIBLE des moteurs de recherche : `noindex` est conservé ici, et la
 *     page elle-même reste `noindex, nofollow`. Un profil promu ne doit jamais
 *     remonter dans Google ;
 *   - PARTAGEABLE sur les réseaux : `noarchive` et `no-store` empêchaient les
 *     robots sociaux de constituer l'aperçu — la publication n'affichait
 *     qu'une URL nue, sans photo ni titre, ce qui vidait la fonction de son
 *     intérêt.
 *
 * Contrepartie annoncée au membre au moment du consentement : une image
 * récupérée par une plateforme sociale peut rester quelques jours dans SON
 * cache après l'expiration du lien. Le site, lui, cesse immédiatement de la
 * servir (404) dès l'expiration ou le retrait.
 */
const BASE_HEADERS: Record<string, string> = {
  // Cache court : l'aperçu social a besoin de récupérer l'image, mais une
  // expiration ou un retrait doit se propager vite.
  "Cache-Control": "public, max-age=300, s-maxage=300",
  "Referrer-Policy": "no-referrer",
  // `noindex` conservé (hors des moteurs), `noarchive` retiré (aperçus).
  "X-Robots-Tag": "noindex",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

/** Une absence d'image ne doit jamais être ni cachée ni archivée. */
const NOT_FOUND_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

function emptyNotFound(): Response {
  return new Response(null, { status: 404, headers: NOT_FOUND_HEADERS });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return emptyNotFound();

  const photo = await getPublicPromotedPhoto(token);
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