"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/landing/logo";

const MEMBER_LINKS = [
  { label: "Tableau de bord", href: "/dashboard" },
  { label: "Rencontres", href: "/matches" },
  { label: "Mon profil", href: "/profile" },
];

export function MemberHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
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
