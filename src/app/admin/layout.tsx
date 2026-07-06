import Link from "next/link";
import { ShieldCheck, Crown, ArrowLeft } from "lucide-react";

import { Logo } from "@/components/landing/logo";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/auth/admin-guard";

export const metadata = {
  title: "Administration — KASSALAFAM",
};

// Rendu dynamique : dépend de la session (cookies) et d'env serveur.
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Garde de premier niveau : TOUTE route /admin/* est protégée ici, même si une
  // page future oubliait sa propre garde. Non authentifié → /login ; non admin
  // → 404. Les pages conservent leur garde (chemin de retour précis + rôle).
  const { isSuperAdmin } = await requireAdmin("/admin");

  return (
    <div className="flex min-h-dvh flex-col bg-cream-50">
      <header className="sticky top-0 z-40 border-b border-champagne-500/20 bg-cream-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" aria-label="Administration KASSALAFAM">
              <Logo className="[&_span]:text-base" />
            </Link>
            {isSuperAdmin ? (
              <span className="hidden items-center gap-1.5 rounded-full border border-champagne-500/40 bg-champagne-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-choco-700 sm:inline-flex">
                <Crown size={13} aria-hidden />
                Super administrateur
              </span>
            ) : (
              <span className="hidden items-center gap-1.5 rounded-full border border-champagne-500/30 bg-champagne-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-choco-700 sm:inline-flex">
                <ShieldCheck size={13} aria-hidden />
                Administrateur
              </span>
            )}
          </div>

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-champagne-500/30 bg-cream-100/60 px-3 py-1.5 text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60"
          >
            <ArrowLeft size={15} aria-hidden />
            <span className="hidden sm:inline">Espace membre</span>
            <span className="sm:hidden">Membre</span>
          </Link>
        </div>

        <AdminNav />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
