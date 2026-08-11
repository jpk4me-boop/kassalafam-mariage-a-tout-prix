import Link from "next/link";
import { BadgeCheck, EyeOff, HeartHandshake, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/landing/logo";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
};

/**
 * Conteneur partagé par /login et /register — écran SCINDÉ sur desktop
 * (inspiration : pages d'inscription concurrentes) : panneau d'identité
 * KASSALAFAM à gauche, carte du formulaire à droite. Sur mobile, la carte
 * seule, comme avant.
 *
 * PARTI PRIS D'HONNÊTETÉ : aucun compteur d'inscrits, aucune citation
 * religieuse (plateforme multiconfessionnelle) — une promesse de marque et
 * trois preuves VRAIES du produit.
 */

const WHY = [
  { icon: BadgeCheck, label: "Profils vérifiés à la main, un par un" },
  { icon: EyeOff, label: "Photos protégées : vous décidez qui voit quoi" },
  { icon: HeartHandshake, label: "Des intentions sérieuses, orientées mariage" },
];

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="relative flex min-h-dvh overflow-hidden">
      {/* Panneau identité — desktop (lg+) uniquement. */}
      <aside
        aria-label="Pourquoi KASSALAFAM"
        className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-gradient-to-br from-choco-700 via-choco-700 to-choco-800 p-10 lg:flex"
      >
        {/* Motif discret + halos, dans l'esprit du grand bloc CTA. */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, var(--color-champagne-300) 1px, transparent 0)",
              backgroundSize: "26px 26px",
            }}
          />
          <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-champagne-400/20 blur-3xl" />
          <div className="absolute -bottom-28 right-0 h-80 w-80 rounded-full bg-champagne-500/15 blur-3xl" />
        </div>

        <div className="relative">
          <Link href="/" aria-label="Retour à l'accueil KASSALAFAM">
            <Logo variant="light" />
          </Link>
        </div>

        <div className="relative flex flex-col gap-8">
          <blockquote className="font-serif text-2xl leading-snug text-cream-50">
            « Le mariage est une décision de vie.{" "}
            <span className="text-gold-gradient">
              Il mérite un cadre à sa hauteur.
            </span>{" "}
            »
          </blockquote>

          <div className="rounded-3xl border border-champagne-400/25 bg-cream-50/5 p-5 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-champagne-300">
              Pourquoi KASSALAFAM ?
            </p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {WHY.map((item) => (
                <li
                  key={item.label}
                  className="flex items-start gap-2.5 text-sm text-cream-100/90"
                >
                  <item.icon
                    size={16}
                    className="mt-0.5 shrink-0 text-champagne-300"
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="relative inline-flex items-center gap-2 text-xs font-medium text-cream-200/70">
          <ShieldCheck size={14} className="text-champagne-300" />
          Plateforme confidentielle et modérée
        </p>
      </aside>

      {/* Colonne du formulaire (pleine largeur sur mobile). */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-12">
        {/* Halos lumineux d'ambiance */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-champagne-400/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-choco-400/15 blur-3xl"
        />

        <div className="relative w-full max-w-md">
          {/* Logo au-dessus de la carte : mobile/tablette seulement (le
              panneau desktop porte déjà l'identité). */}
          <div className="mb-8 flex justify-center lg:hidden">
            <Link href="/" aria-label="Retour à l'accueil KASSALAFAM">
              <Logo />
            </Link>
          </div>

          <div className="glass rounded-3xl p-6 shadow-card sm:p-8">
            <div className="mb-6 text-center">
              <h1 className="font-serif text-2xl font-semibold text-choco-700 sm:text-3xl">
                {title}
              </h1>
              <p className="mt-2 text-sm text-ink-700/70">{subtitle}</p>
            </div>

            {children}
          </div>

          <p className="mt-6 text-center text-sm text-ink-700/70">{footer}</p>
        </div>
      </div>
    </main>
  );
}
