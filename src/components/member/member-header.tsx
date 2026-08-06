"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Compass,
  Crown,
  Eye,
  Heart,
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
  },
  {
    label: "Notifications",
    href: "/notifications",
    icon: Bell,
  },
] as const;

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

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-label={link.label}
                title={link.label}
                className="flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full text-ink-700/65 transition-colors hover:bg-champagne-400/15 hover:text-choco-700 sm:h-10 sm:w-10 xl:w-auto xl:px-3"
              >
                <Icon size={19} />
                <span className="hidden text-xs font-semibold xl:inline">
                  {link.label}
                </span>
              </Link>
            );
          })}

          <details className="group relative shrink-0">
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

            <div className="absolute right-0 top-14 w-64 overflow-hidden rounded-2xl border border-champagne-500/25 bg-cream-50 p-2 shadow-[0_24px_60px_-24px_rgba(43,26,18,0.55)]">
              <div className="border-b border-champagne-500/20 px-3 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-ink-700/45">
                  Mon espace
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-choco-700">
                  {displayName || "Membre KASSALAFAM"}
                </p>
              </div>

              <Link
                href="/profile"
                className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-700/75 transition-colors hover:bg-champagne-400/15 hover:text-choco-700"
              >
                <UserRound size={17} />
                Mon profil
              </Link>

              <Link
                href="/partager"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-700/75 transition-colors hover:bg-champagne-400/15 hover:text-choco-700"
              >
                <Share2 size={17} />
                Partager KASSALAFAM
              </Link>

              {isAdmin ? (
                <Link
                  href="/admin"
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
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
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
