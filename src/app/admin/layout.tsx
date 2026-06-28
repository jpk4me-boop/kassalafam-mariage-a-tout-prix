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
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
