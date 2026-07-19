import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleAlert, Mail, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/landing/logo";
import { SuspendedAccountSignOut } from "@/components/member/suspended-account-sign-out";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compte suspendu | KASSALAFAM",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AccountSuspendedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.account_status !== "suspended") {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-dvh bg-cream-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <div className="flex justify-center">
          <Link href="/" aria-label="Accueil KASSALAFAM">
            <Logo />
          </Link>
        </div>

        <section className="rounded-3xl border border-amber-700/20 bg-white/80 p-6 text-center shadow-card sm:p-10">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-600/10 text-amber-800">
            <CircleAlert size={28} aria-hidden="true" />
          </span>

          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-champagne-700">
            Accès membre temporairement suspendu
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
            Votre compte est en cours d’examen
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-ink-700/75 sm:text-base">
            Les rencontres, les intérêts, les profils et la messagerie sont
            temporairement indisponibles. Vos données, vos matchs et votre
            historique de conversation sont conservés et redeviendront
            accessibles si votre compte est réactivé.
          </p>

          <div className="mx-auto mt-6 flex max-w-xl items-start gap-3 rounded-2xl border border-champagne-500/25 bg-cream-100/65 p-4 text-left text-sm text-ink-700/75">
            <ShieldCheck className="mt-0.5 shrink-0 text-choco-600" size={19} />
            <p>
              Aucune nouvelle interaction ne peut être effectuée pendant la
              suspension. Cette restriction est appliquée directement par la
              base de données, indépendamment de l’interface.
            </p>
          </div>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="mailto:contact@kassalafam.com"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60"
            >
              <Mail size={17} />
              Contacter l’assistance
            </a>
            <SuspendedAccountSignOut />
          </div>
        </section>

        <p className="text-center text-xs leading-5 text-ink-700/50">
          Pour protéger la confidentialité de tous les membres, cette page ne
          communique aucune information sur d’autres comptes ni sur les outils
          internes de modération.
        </p>
      </div>
    </main>
  );
}
