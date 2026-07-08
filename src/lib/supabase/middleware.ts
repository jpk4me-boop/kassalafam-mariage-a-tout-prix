import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { isCoreComplete } from "@/lib/onboarding/completion";
import {
  CONTINUE_LATER_COOKIE,
  continueLaterCookieValue,
} from "@/lib/onboarding/continue-later";
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
 * Routes du parcours membre soumises à la garde d'onboarding. Un membre
 * authentifié y est redirigé vers /onboarding (avec la destination initialement
 * demandée) tant que :
 *   - sa source d'acquisition (colonne write-once) est NULL — sans échappatoire,
 *     y compris pour les comptes historiques ; OU
 *   - son profil « cœur » est incomplet (mode `full` du wizard, reprise à la
 *     première étape incomplète) — SAUF si le cookie de session
 *     « Continuer plus tard » posé par le wizard correspond au compte courant.
 * /profile est inclus : c'est une page de MODIFICATION ultérieure, pas le
 * parcours initial — un membre en cours d'onboarding ne doit pas pouvoir
 * contourner le wizard en ouvrant directement l'ancien formulaire (après
 * « Continuer plus tard », il redevient accessible).
 * Volontairement hors périmètre :
 *   - /onboarding lui-même (anti-boucle) ;
 *   - /admin (accès back-office, hors parcours membre).
 */
const ONBOARDING_GATE_PREFIXES = [
  "/dashboard",
  "/discover",
  "/matches",
  "/profile",
];

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
  // membre doit avoir répondu à « Comment nous as-tu découverts ? » ET terminé
  // son profil cœur (sauf échappatoire « Continuer plus tard »). On ne lit le
  // profil (un SELECT indexé sur la PK) que sur ces routes, pour ne pas alourdir
  // les autres requêtes ; le SELECT photos n'est payé que si les colonnes cœur
  // sont déjà toutes remplies.
  if (user && ONBOARDING_GATE_PREFIXES.some((p) => matchesRoute(pathname, p))) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "acquisition_source_recorded_at, gender, birth_date, marital_status, country, city",
      )
      .eq("id", user.id)
      .maybeSingle();

    // Fail-open : sur erreur Supabase (réseau, indisponibilité…), on NE bloque
    // PAS le membre — on le laisse poursuivre plutôt que de le piéger dans une
    // redirection. La garde se réappliquera à la prochaine navigation.
    if (!profileError) {
      // Acquisition write-once : bloquante tant que NULL, sans échappatoire.
      let needsOnboarding = !profile?.acquisition_source_recorded_at;

      // Complétude profil : bloquante en mode `full`, SAUF si le cookie de
      // session « Continuer plus tard » posé par le wizard correspond au compte
      // courant (empreinte comparée — un cookie hérité d'un autre compte du
      // même navigateur est ignoré). L'empreinte n'est calculée que si un
      // cookie est présent.
      const rawContinueLater = request.cookies.get(
        CONTINUE_LATER_COOKIE,
      )?.value;
      const continueLater =
        rawContinueLater != null &&
        rawContinueLater === (await continueLaterCookieValue(user.id));
      if (!needsOnboarding && !continueLater && profile) {
        if (!isCoreComplete(profile, true)) {
          needsOnboarding = true;
        } else {
          const { data: primaryPhoto, error: photoError } = await supabase
            .from("photos")
            .select("id")
            .eq("profile_id", user.id)
            .eq("is_primary", true)
            .limit(1)
            .maybeSingle();
          // Même fail-open que pour le profil : sur erreur, on laisse passer.
          needsOnboarding = !photoError && primaryPhoto == null;
        }
      }

      if (needsOnboarding) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/onboarding";
        redirectUrl.search = "";
        // Destination initialement demandée (chemin + éventuels paramètres),
        // restituée après l'onboarding (ou « Continuer plus tard »).
        redirectUrl.searchParams.set(
          "redirect",
          `${pathname}${request.nextUrl.search}`,
        );
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  return response;
}
