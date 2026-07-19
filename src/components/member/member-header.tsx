"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Share2, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { clearContinueLaterCookie } from "@/lib/onboarding/continue-later";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/landing/logo";

const MEMBER_LINKS = [
  { label: "Tableau de bord", href: "/dashboard" },
  { label: "Découvrir", href: "/discover" },
  { label: "Rencontres", href: "/matches" },
  { label: "Mon profil", href: "/profile" },
];

/**
 * `isAdmin` est calculé CÔTÉ SERVEUR (member layout) puis passé en prop : ce
 * composant client ne voit qu'un booléen, jamais un UUID d'administrateur.
 */
export function MemberHeader({ isAdmin = false }: { isAdmin?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // Le report « Continuer plus tard » est personnel : il ne doit pas survivre
    // à la déconnexion ni bénéficier à un autre compte du même navigateur.
    clearContinueLaterCookie();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-champagne-500/20 bg-cream-50/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/dashboard" aria-label="Espace membre KASSALAFAM">
          <Logo className="[&_span]:text-base" />
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <nav className="hidden items-center gap-1 sm:flex">
            {MEMBER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-champagne-400/20 text-choco-700"
                    : "text-ink-700/75 hover:text-choco-600",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {isAdmin ? (
            <Link
              href="/admin"
              aria-label="Administration KASSALAFAM"
              className="flex items-center gap-2 rounded-full border border-choco-600/30 bg-choco-600/10 px-4 py-2 text-sm font-semibold text-choco-700 transition-colors hover:bg-choco-600/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60"
            >
              <ShieldCheck size={16} />
              <span className="hidden sm:inline">Administration</span>
            </Link>
          ) : null}

          <Link
            href="/partager"
            aria-label="Partager KASSALAFAM"
            className="flex items-center gap-2 rounded-full border border-champagne-500/30 bg-cream-100/60 px-4 py-2 text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60"
          >
            <Share2 size={16} />
            <span className="hidden sm:inline">Partager</span>
          </Link>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-2 rounded-full border border-champagne-500/30 bg-cream-100/60 px-4 py-2 text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/15 disabled:opacity-60"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">
              {signingOut ? "Déconnexion…" : "Se déconnecter"}
            </span>
          </button>
        </div>
      </div>

      {/* Navigation mobile */}
      <nav className="flex items-center gap-1 border-t border-champagne-500/15 px-4 py-2 sm:hidden">
        {MEMBER_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition-colors",
              pathname === link.href
                ? "bg-champagne-400/20 text-choco-700"
                : "text-ink-700/75 hover:text-choco-600",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
