import { getPublicSharedPhoto } from "@/lib/server/public-profile-share";

/**
 * Partage PR3 — Endpoint SERVEUR de diffusion contrôlée de la photo publique.
 *
 * La photo n'est JAMAIS servie par URL signée Supabase : une telle URL
 * contient le storage_path en clair (`{UUID profil}/{UUID photo}.{ext}`) et
 * révélerait l'UUID du membre dans le HTML public. Ici, les octets sont
 * téléchargés côté serveur (client admin) et re-servis tels quels : aucune
 * redirection, aucun chemin, aucun UUID, aucune URL Supabase ne sort.
 *
 * Toute situation sans image (jeton invalide/expiré/révoqué, consentement
 * retiré, floutage activé, photo absente, type MIME hors liste blanche,
 * taille excessive) rend le MÊME 404 vide, sans distinction de cause. Le
 * jeton et le chemin ne sont jamais journalisés.
 */

export const dynamic = "force-dynamic";

/** En-têtes communs : jamais de cache, jamais de référent, jamais indexé,
 *  jamais embarquable depuis une autre origine. */
const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function emptyNotFound(): Response {
  return new Response(null, { status: 404, headers: BASE_HEADERS });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return emptyNotFound();

  const photo = await getPublicSharedPhoto(token);
  if (!photo) return emptyNotFound();

  return new Response(photo.body, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      // Content-Type déjà validé contre la liste blanche (jpeg/png/webp).
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.body.byteLength),
    },
  });
}
