"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart3, BadgeCheck, Flag } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Navigation principale du back-office avec état actif (nécessite le pathname
 * → composant client). N'affiche AUCUN identifiant sensible : purement des liens.
 */
type AdminNavLink = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** `true` : n'est actif que sur une correspondance exacte (évite que
   * « Vue d’ensemble » /admin reste actif sur /admin/analytics). */
  exact?: boolean;
};

const ADMIN_LINKS: AdminNavLink[] = [
  { label: "Vue d’ensemble", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Statistiques", href: "/admin/analytics", icon: BarChart3 },
  { label: "Vérification", href: "/admin/verification", icon: BadgeCheck },
  { label: "Signalements", href: "/admin/reports", icon: Flag },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-t border-champagne-500/15">
      <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6">
        {ADMIN_LINKS.map((link) => {
          const isActive = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-champagne-400/20 text-choco-700"
                  : "text-ink-700/70 hover:text-choco-700",
              )}
            >
              <Icon size={15} aria-hidden />
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
