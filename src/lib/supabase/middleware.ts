import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/types/database";

/** Routes réservées aux utilisateurs connectés (membres + back-office admin).
 *  Le contrôle fin du rôle admin (allowlist) est fait dans le Server Component
 *  de la page admin ; ici on garantit seulement qu'un anonyme est redirigé. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/profile",
  "/discover",
  "/matches",
  "/admin",
  "/onboarding",
];
/** Routes d'authentification : un membre déjà connecté est redirigé ailleurs. */
const AUTH_PREFIXES = ["/login", "/register"];

/**
 * Routes du parcours membre soumises à la garde d'onboarding « Comment nous
 * as-tu découverts ? ». Un membre authentifié n'ayant pas encore enregistré sa
 * source d'acquisition (colonne write-once NULL, y compris les comptes
 * historiques) y est redirigé UNE fois vers /onboarding, avec la destination
 * initialement demandée. Volontairement hors périmètre :
 *   - /onboarding lui-même (anti-boucle) ;
 *   - /admin (accès back-office, hors parcours membre) ;
 *   - /profile : un nouvel inscrit y est envoyé juste après l'inscription pour
 *     configurer son profil ; on ne l'interrompt pas. La question précède
 *     l'accès normal (tableau de bord / découverte / mises en relation), ce qui
 *     couvre aussi les comptes historiques à leur prochaine navigation.
 */
const ONBOARDING_GATE_PREFIXES = ["/dashboard", "/discover", "/matches"];

/**
 * Correspondance de route à FRONTIÈRE exacte : le chemin est soit exactement le
 * préfixe, soit un sous-chemin `préfixe/…`. Évite qu'un `/dashboardx` (ou un
 * hypothétique `/admin-tools`) ne matche `/dashboard` (resp. `/admin`) par un
 * simple `startsWith`.
 */
function matchesRoute(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Rafraîchit la session Supabase et applique la protection des routes.
 * Inspiré du pattern officiel @supabase/ssr pour le middleware Next.js.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase env manquantes: NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY doivent être définies.",
    );
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => matchesRoute(pathname, p));
  const isAuthRoute = AUTH_PREFIXES.some((p) => matchesRoute(pathname, p));

  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Garde d'onboarding : un membre authentifié atteignant une route du parcours
  // membre doit d'abord avoir répondu à « Comment nous as-tu découverts ? ». On
  // ne lit le profil (un SELECT indexé sur la PK) que sur ces routes, pour ne
  // pas alourdir les autres requêtes. La source étant write-once, dès qu'elle
  // est enregistrée cette redirection ne se déclenche plus.
  if (user && ONBOARDING_GATE_PREFIXES.some((p) => matchesRoute(pathname, p))) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("acquisition_source_recorded_at")
      .eq("id", user.id)
      .maybeSingle();

    // Fail-open : sur erreur Supabase (réseau, indisponibilité…), on NE bloque
    // PAS le membre — on le laisse poursuivre plutôt que de le piéger dans une
    // redirection. La garde se réappliquera à la prochaine navigation.
    if (!profileError && !profile?.acquisition_source_recorded_at) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/onboarding";
      redirectUrl.search = "";
      // Destination initialement demandée (chemin + éventuels paramètres),
      // restituée après enregistrement de la source.
      redirectUrl.searchParams.set(
        "redirect",
        `${pathname}${request.nextUrl.search}`,
      );
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}
