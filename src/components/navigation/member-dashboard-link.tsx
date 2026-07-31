"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

/**
 * Bouton « Tableau de bord », affiché UNIQUEMENT lorsqu'une session membre
 * existe. Conçu pour les pages publiques (aide, légales…) qui doivent rester
 * statiques : la détection de session se fait côté client après hydratation,
 * sans rendre la page dynamique côté serveur.
 *
 * Anonyme ou hors ligne : rien ne s'affiche (amélioration progressive).
 */
export function MemberDashboardLink({ className }: { className?: string }) {
  const [isMember, setIsMember] = useState(false);

  useEffect(() => {
    let active = true;

    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (active && data.session) setIsMember(true);
      })
      .catch(() => {
        /* Silencieux : le bouton reste simplement masqué. */
      });

    return () => {
      active = false;
    };
  }, []);

  if (!isMember) return null;

  return (
    <Link
      href="/dashboard"
      className={
        className ??
        "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-champagne-500/30 bg-cream-100/60 px-4 py-2 text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
      }
    >
      <LayoutDashboard size={16} />
      <span className="hidden sm:inline">Tableau de bord</span>
    </Link>
  );
}
