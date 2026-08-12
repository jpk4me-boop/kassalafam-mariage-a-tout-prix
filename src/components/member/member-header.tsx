"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BadgeCheck,
  CircleHelp,
  Compass,
  Crown,
  Eye,
  EyeOff,
  Heart,
  ImageOff,
  Images,
  Home,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Rocket,
  Share2,
  ShieldCheck,
  UserRound,
  UserRoundCheck,
} from "lucide-react";

import { Logo } from "@/components/landing/logo";
import { clearContinueLaterCookie } from "@/lib/onboarding/continue-later";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type {
  ProfileVerificationStatus,
  RelationshipItem,
} from "@/lib/types/database";

type MemberHeaderProps = Readonly<{
  isAdmin?: boolean;
  displayName?: string | null;
  avatarUrl?: string | null;
}>;

const PRIMARY_LINKS = [
  {
    label: "Accueil",
    href: "/",
    icon: Home,
  },
  {
    label: "Tableau de bord",
    href: "/dashboard",
    icon: LayoutDashboard,
    // Libellé court : la grille mobile ne dispose que d'une colonne étroite.
    short: "Tableau",
  },
  {
    label: "Découverte",
    href: "/discover",
    icon: Compass,
  },
  {
    label: "Visiteurs",
    href: "/visitors",
    icon: Eye,
  },
  {
    label: "Favoris",
    href: "/favorites",
    icon: Heart,
  },
  {
    label: "Demandes",
    href: "/matches?tab=received",
    icon: UserRoundCheck,
  },
  {
    label: "Premium",
    href: "/premium",
    icon: Crown,
    premium: true,
  },
] as const;

const ACTION_LINKS = [
  {
    label: "Boost",
    href: "/boost",
    icon: Rocket,
  },
  {
    label: "Messages",
    href: "/matches?tab=matched",
    icon: MessageCircle,
    badge: "messages",
  },
  {
    label: "Notifications",
    href: "/notifications",
    icon: Bell,
    badge: "notifications",
  },
] as const;

/** Plafond d'affichage des compteurs : au-delà, « 99+ ». */
function formatBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function routePath(href: string): string {
  return href.split("?")[0] ?? href;
}

function isRouteActive(pathname: string, href: string): boolean {
  const path = routePath(href);

  return pathname === path || pathname.startsWith(`${path}/`);
}

export function MemberHeader({
  isAdmin = false,
  displayName = null,
  avatarUrl = null,
}: MemberHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  // Compteurs de NON-LUS (messages, notifications) — signal visuel sur les
  // deux icônes d'action. Sources EXISTANTES uniquement : la RPC
  // `list_my_relationships` (champ unread_count par conversation) et un
  // comptage RLS sur `member_notifications` (read_at null, lignes du membre).
  // Rafraîchi au montage, À CHAQUE navigation (les non-lus retombent après
  // lecture) et au retour de focus/visibilité — AUCUN polling en continu.
  const [unread, setUnread] = useState<{
    messages: number;
    notifications: number;
  } | null>(null);

  // Menu du profil (Lot H) — deux RÉGLAGES réels, accessibles en un geste
  // depuis n'importe quel écran : le flou des photos et les visites discrètes.
  // Ce sont des colonnes de `profiles` déjà éditables par le membre ; le menu
  // n'invente rien, il raccourcit un aller-retour vers /profile.
  const [reglages, setReglages] = useState<{
    blurPhotos: boolean;
    discreetVisits: boolean;
    verification: ProfileVerificationStatus;
  } | null>(null);
  const [reglageEnCours, setReglageEnCours] = useState<
    "blur_photos" | "discreet_visits" | null
  >(null);
  const menuRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [relationships, notifications, profil] = await Promise.all([
        supabase.rpc("list_my_relationships"),
        supabase
          .from("member_notifications")
          .select("id", { count: "exact", head: true })
          .is("read_at", null),
        user
          ? supabase
              .from("profiles")
              .select("blur_photos, discreet_visits, verification_status")
              .eq("id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (cancelled) return;

      // Réglages : en cas d'échec on n'affiche PAS d'interrupteur plutôt que
      // d'en afficher un qui mentirait sur l'état réel du profil.
      if (!profil.error && profil.data) {
        setReglages({
          blurPhotos: profil.data.blur_photos ?? true,
          discreetVisits: profil.data.discreet_visits ?? false,
          verification: profil.data.verification_status ?? "pending",
        });
      }
      const messages =
        relationships.error || !relationships.data
          ? 0
          : (relationships.data as RelationshipItem[]).reduce(
              (sum, r) => sum + (r.unread_count ?? 0),
              0,
            );
      setUnread({
        messages,
        notifications: notifications.error ? 0 : (notifications.count ?? 0),
      });
    };

    void load();
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  /** Ferme le volet du profil — sur navigation, Échap, ou clic à l'extérieur. */
  function fermerMenu() {
    if (menuRef.current) menuRef.current.open = false;
  }

  useEffect(() => {
    function surTouche(e: KeyboardEvent) {
      if (e.key === "Escape") fermerMenu();
    }

    function surClic(e: MouseEvent) {
      const menu = menuRef.current;
      if (!menu?.open) return;
      if (!menu.contains(e.target as Node)) fermerMenu();
    }

    document.addEventListener("keydown", surTouche);
    document.addEventListener("mousedown", surClic);
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.removeEventListener("mousedown", surClic);
    };
  }, []);

  /**
   * Bascule un réglage de confidentialité depuis le menu.
   *
   * Optimiste, avec RETOUR EN ARRIÈRE en cas d'échec : sur un réglage de
   * confidentialité, laisser l'interrupteur mentir serait pire que de ne rien
   * afficher — le membre croirait ses photos ouvertes alors qu'elles sont
   * floutées, ou l'inverse.
   */
  async function basculerReglage(champ: "blur_photos" | "discreet_visits") {
    if (!reglages || reglageEnCours) return;

    const avant =
      champ === "blur_photos" ? reglages.blurPhotos : reglages.discreetVisits;
    const apres = !avant;

    setReglageEnCours(champ);
    setReglages(
      champ === "blur_photos"
        ? { ...reglages, blurPhotos: apres }
        : { ...reglages, discreetVisits: apres },
    );

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = user
      ? await supabase
          .from("profiles")
          .update(
            champ === "blur_photos"
              ? { blur_photos: apres }
              : { discreet_visits: apres },
          )
          .eq("id", user.id)
      : { error: { message: "session absente" } };

    if (error) {
      console.error("[menu profil] réglage non enregistré:", error.message);
      setReglages(
        champ === "blur_photos"
          ? { ...reglages, blurPhotos: avant }
          : { ...reglages, discreetVisits: avant },
      );
    } else {
      // Les écrans rendus côté serveur (cartes, vitrine) doivent refléter le
      // nouveau réglage sans attendre une navigation.
      router.refresh();
    }

    setReglageEnCours(null);
  }

  async function handleSignOut() {
    setSigningOut(true);

    const supabase = createClient();
    await supabase.auth.signOut();

    clearContinueLaterCookie();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-champagne-500/20 bg-cream-50/95 shadow-[0_10px_35px_-28px_rgba(43,26,18,0.5)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6 lg:px-8">
        <Link
          href="/dashboard"
          aria-label="Tableau de bord KASSALAFAM"
          className="flex min-w-0 shrink items-center overflow-hidden lg:shrink-0"
        >
          <Logo
            className="min-w-0 gap-2 sm:gap-3"
            markClassName="h-10 w-10 sm:h-11 sm:w-11"
            wordmarkClassName="truncate text-[0.9rem] max-[359px]:text-[0.72rem] sm:text-base"
            baselineClassName="truncate text-[0.55rem] tracking-[0.12em] max-[359px]:hidden sm:text-[0.62rem] sm:tracking-[0.28em]"
          />
        </Link>

        <nav
          aria-label="Navigation principale"
          className="ml-auto hidden items-center gap-1 lg:flex"
        >
          {PRIMARY_LINKS.map((link) => {
            const active = isRouteActive(pathname, link.href);
            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex min-w-[76px] flex-col items-center justify-center gap-1 rounded-2xl border px-2.5 py-2 text-xs font-semibold transition-all",
                  "premium" in link && link.premium
                    ? active
                      ? "border-champagne-600/75 bg-gradient-to-br from-champagne-300 via-champagne-200 to-champagne-500 text-choco-900 shadow-[0_12px_28px_-16px_rgba(180,125,30,0.9)]"
                      : "border-champagne-500/55 bg-gradient-to-br from-champagne-200/80 via-cream-50 to-champagne-300/70 text-champagne-800 shadow-[0_10px_24px_-18px_rgba(180,125,30,0.8)] hover:-translate-y-0.5 hover:border-champagne-600/70 hover:text-choco-900"
                    : active
                      ? "border-transparent bg-champagne-400/20 text-choco-700"
                      : "border-transparent text-ink-700/65 hover:bg-cream-100 hover:text-choco-700",
                )}
              >
                <Icon
                  size={18}
                  strokeWidth={active ? 2.4 : 2}
                />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1 lg:ml-3">
          {ACTION_LINKS.map((link) => {
            const Icon = link.icon;
            const count =
              "badge" in link && unread ? unread[link.badge] : 0;
            const ariaLabel =
              count > 0
                ? `${link.label} — ${formatBadgeCount(count)} non lu${count > 1 ? "s" : ""}`
                : link.label;

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-label={ariaLabel}
                title={ariaLabel}
                className="relative flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full text-ink-700/65 transition-colors hover:bg-champagne-400/15 hover:text-choco-700 sm:h-10 sm:w-10 xl:w-auto xl:px-3"
              >
                <Icon size={19} />
                <span className="hidden text-xs font-semibold xl:inline">
                  {link.label}
                </span>
                {count > 0 ? (
                  <span
                    aria-hidden
                    className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-cream-50 ring-2 ring-cream-50 xl:right-0.5"
                  >
                    {formatBadgeCount(count)}
                  </span>
                ) : null}
              </Link>
            );
          })}

          <details ref={menuRef} className="group relative shrink-0">
            <summary
              aria-label="Ouvrir le menu du profil"
              className="flex h-10 w-10 cursor-pointer list-none items-center justify-center overflow-hidden rounded-full border-2 border-champagne-400 bg-choco-700 text-cream-50 shadow-sm outline-none transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-champagne-500/60 sm:h-11 sm:w-11 [&::-webkit-details-marker]:hidden"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={
                    displayName
                      ? `Photo de ${displayName}`
                      : "Photo du membre"
                  }
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound size={21} />
              )}
            </summary>

            <div className="absolute right-0 top-14 w-72 overflow-hidden rounded-2xl border border-champagne-500/25 bg-cream-50 p-2 shadow-[0_24px_60px_-24px_rgba(43,26,18,0.55)]">
              <div className="border-b border-champagne-500/20 px-3 py-3">
                <p className="truncate text-sm font-semibold text-choco-700">
                  {displayName || "Membre KASSALAFAM"}
                </p>

                {/* État de vérification : le membre doit pouvoir le lire d'un
                    coup d'œil, depuis n'importe quel écran. */}
                {reglages ? (
                  reglages.verification === "approved" ? (
                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-600/10 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      <BadgeCheck size={12} />
                      Profil vérifié
                    </span>
                  ) : (
                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-champagne-500/40 bg-champagne-400/15 px-2.5 py-1 text-xs font-medium text-choco-700">
                      <ShieldCheck size={12} />
                      Vérification en cours
                    </span>
                  )
                ) : null}
              </div>

              {/* RÉGLAGES DE CONFIDENTIALITÉ — deux bascules réelles, écrites
                  directement sur le profil. Elles n'apparaissent que si l'état
                  a pu être lu : un interrupteur qui ignore son propre état
                  vaut moins que pas d'interrupteur du tout. */}
              {reglages ? (
                <div className="mt-1 border-b border-champagne-500/20 pb-1">
                  <button
                    type="button"
                    onClick={() => void basculerReglage("blur_photos")}
                    disabled={reglageEnCours !== null}
                    aria-pressed={!reglages.blurPhotos}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      reglages.blurPhotos
                        ? "bg-champagne-400/15 text-choco-700 hover:bg-champagne-400/25"
                        : "text-ink-700/75 hover:bg-champagne-400/15 hover:text-choco-700",
                    )}
                  >
                    {reglages.blurPhotos ? (
                      <Images size={17} className="shrink-0 text-champagne-700" />
                    ) : (
                      <ImageOff size={17} className="shrink-0" />
                    )}
                    <span className="min-w-0">
                      {reglages.blurPhotos
                        ? "Déflouter mes photos"
                        : "Reflouter mes photos"}
                      <span className="mt-0.5 block text-xs font-normal text-ink-700/55">
                        {reglages.blurPhotos
                          ? "Elles sont floutées pour les autres membres"
                          : "Elles sont visibles des membres compatibles"}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void basculerReglage("discreet_visits")}
                    disabled={reglageEnCours !== null}
                    aria-pressed={reglages.discreetVisits}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-700/75 transition-colors hover:bg-champagne-400/15 hover:text-choco-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {reglages.discreetVisits ? (
                      <EyeOff size={17} className="shrink-0" />
                    ) : (
                      <Eye size={17} className="shrink-0" />
                    )}
                    <span className="min-w-0">
                      Visites discrètes
                      <span className="mt-0.5 block text-xs font-normal text-ink-700/55">
                        {reglages.discreetVisits
                          ? "Activées : vos visites ne sont pas vues"
                          : "Désactivées : vos visites sont visibles"}
                      </span>
                    </span>
                  </button>
                </div>
              ) : null}

              <Link
                href="/profile"
                onClick={fermerMenu}
                className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-700/75 transition-colors hover:bg-champagne-400/15 hover:text-choco-700"
              >
                <UserRound size={17} />
                Mon profil
              </Link>

              <Link
                href="/partager"
                onClick={fermerMenu}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-700/75 transition-colors hover:bg-champagne-400/15 hover:text-choco-700"
              >
                <Share2 size={17} />
                Partager KASSALAFAM
              </Link>

              <Link
                href="/aide"
                onClick={fermerMenu}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-700/75 transition-colors hover:bg-champagne-400/15 hover:text-choco-700"
              >
                <CircleHelp size={17} />
                Aide et questions fréquentes
              </Link>

              {isAdmin ? (
                <Link
                  href="/admin"
                  onClick={fermerMenu}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-700/75 transition-colors hover:bg-champagne-400/15 hover:text-choco-700"
                >
                  <ShieldCheck size={17} />
                  Administration
                </Link>
              ) : null}

              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex w-full items-center gap-3 rounded-xl border-t border-champagne-500/20 px-3 py-2.5 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut size={17} />
                {signingOut ? "Déconnexion…" : "Se déconnecter"}
              </button>
            </div>
          </details>
        </div>
      </div>

      {/*
        Mobile : grille au lieu d'une rangée qui débordait vers la droite.
        4 colonnes sous 640 px (2 rangées, « Premium » occupe la place restante),
        7 colonnes au-delà — plus aucun défilement horizontal.
      */}
      <nav
        aria-label="Navigation membre mobile"
        className="grid grid-cols-4 gap-1 border-t border-champagne-500/15 px-2 py-2 sm:gap-1.5 sm:px-3 sm:grid-cols-7 lg:hidden"
      >
        {PRIMARY_LINKS.map((link) => {
          const active = isRouteActive(pathname, link.href);
          const Icon = link.icon;
          const premium = "premium" in link && link.premium;

          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-[10px] font-semibold transition-all sm:px-1.5 sm:text-[11px]",
                premium ? "col-span-2 sm:col-span-1" : undefined,
                premium
                  ? active
                    ? "border-champagne-600/75 bg-gradient-to-br from-champagne-300 via-champagne-200 to-champagne-500 text-choco-900 shadow-sm"
                    : "border-champagne-500/55 bg-gradient-to-br from-champagne-200/80 via-cream-50 to-champagne-300/70 text-champagne-800 shadow-sm"
                  : active
                    ? "border-transparent bg-champagne-400/20 text-choco-700"
                    : "border-transparent text-ink-700/60 hover:bg-cream-100 hover:text-choco-700",
              )}
            >
              <Icon size={17} className="shrink-0" />
              <span className="w-full truncate text-center">
                {"short" in link ? link.short : link.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
