import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { Logo } from "@/components/landing/logo";

export const metadata = {
  title: "Administration — KASSALAFAM",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-champagne-500/20 bg-cream-50/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/dashboard" aria-label="Espace KASSALAFAM">
            <Logo className="[&_span]:text-base" />
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-champagne-500/30 bg-champagne-400/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-choco-700">
            <ShieldCheck size={14} />
            Back-office
          </span>
        </div>
        {/* Navigation back-office discrète (pas d'état actif : Server Component). */}
        <nav className="border-t border-champagne-500/15">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-4 py-2 sm:px-6">
            <Link
              href="/admin/verification"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-700/70 transition-colors hover:text-choco-700"
            >
              Vérification des profils
            </Link>
            <Link
              href="/admin/reports"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-700/70 transition-colors hover:text-choco-700"
            >
              Signalements
            </Link>
            <Link
              href="/admin/members"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-700/70 transition-colors hover:text-choco-700"
            >
              Comptes membres
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
