import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  CONTINUE_LATER_COOKIE,
  continueLaterCookieValue,
} from "@/lib/onboarding/continue-later";
import type { Database } from "@/lib/types/database";

const ACCOUNT_SUSPENDED_PATH = "/account-suspended";

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
  ACCOUNT_SUSPENDED_PATH,
];
/** Routes d'authentification : un membre déjà connecté est redirigé ailleurs. */
const AUTH_PREFIXES = ["/login", "/register"];

/**
 * Routes membre bloquées quand `profiles.account_status = suspended`.
 * Le préfixe `/admin` est inclus : une allowlist serveur ne doit jamais
 * contourner la suspension du compte. La garde admin répète ce contrôle côté
 * serveur pour protéger également les Server Actions.
 */
const MEMBER_APP_PREFIXES = [
  "/dashboard",
  "/profile",
  "/discover",
  "/matches",
  "/onboarding",
  "/admin",
];

/**
 * Routes du parcours membre soumises à la garde d'onboarding, fondée sur le
 * MARQUEUR de fin explicite (`onboarding_completed_at`, posé par la RPC
 * complete_member_onboarding) — la garde ne recalcule JAMAIS la complétude
 * dynamique à chaque requête :
 *   - marqueur posé → accès ;
 *   - marqueur NULL + acquisition NULL → redirection, sans échappatoire ;
 *   - marqueur NULL + acquisition posée → redirection, SAUF cookie de session
 *     « Continuer plus tard » correspondant au compte courant.
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
  const isSuspensionPage = matchesRoute(pathname, ACCOUNT_SUSPENDED_PATH);
  const isMemberAppRoute = MEMBER_APP_PREFIXES.some((p) =>
    matchesRoute(pathname, p),
  );

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

  // Une seule lecture du profil pour la suspension et l'onboarding. La base
  // reste l'autorité : cette garde améliore l'UX mais ne remplace pas les RPC/RLS.
  if (user && (isMemberAppRoute || isSuspensionPage)) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "account_status, acquisition_source_recorded_at, onboarding_completed_at",
      )
      .eq("id", user.id)
      .maybeSingle();

    // Fail-open sur incident Supabase : le membre n'est pas piégé par une panne.
    // Les protections PostgreSQL autoritatives continuent de bloquer les actions.
    if (!profileError) {
      const isSuspended = profile?.account_status === "suspended";

      if (isSuspended && !isSuspensionPage) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = ACCOUNT_SUSPENDED_PATH;
        redirectUrl.search = "";
        return NextResponse.redirect(redirectUrl);
      }

      if (!isSuspended && isSuspensionPage) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        redirectUrl.search = "";
        return NextResponse.redirect(redirectUrl);
      }

      // Garde d'onboarding : fondée sur le MARQUEUR de fin explicite.
      if (
        !isSuspensionPage &&
        ONBOARDING_GATE_PREFIXES.some((p) => matchesRoute(pathname, p))
      ) {
        let needsOnboarding = !profile?.onboarding_completed_at;

        // Acquisition posée mais parcours non finalisé : l'échappatoire
        // « Continuer plus tard » (cookie de session lié au compte) donne un
        // accès temporaire.
        if (needsOnboarding && profile?.acquisition_source_recorded_at) {
          const rawContinueLater = request.cookies.get(
            CONTINUE_LATER_COOKIE,
          )?.value;
          if (
            rawContinueLater != null &&
            rawContinueLater === (await continueLaterCookieValue(user.id))
          ) {
            needsOnboarding = false;
          }
        }

        if (needsOnboarding) {
          const redirectUrl = request.nextUrl.clone();
          redirectUrl.pathname = "/onboarding";
          redirectUrl.search = "";
          redirectUrl.searchParams.set(
            "redirect",
            `${pathname}${request.nextUrl.search}`,
          );
          return NextResponse.redirect(redirectUrl);
        }
      }
    }
  }

  return response;
}
