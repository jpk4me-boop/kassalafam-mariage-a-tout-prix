import {
  BadgeCheck,
  Heart,
  Lock,
  MapPin,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

/**
 * Fenêtre produit — une « fausse fenêtre de navigateur » qui montre l'intérieur
 * de la plateforme (inspiration : section démo des plateformes concurrentes),
 * SANS capture d'écran : tout est recréé en HTML/CSS.
 *
 * CONFIDENTIALITÉ : aucun vrai profil, aucun vrai message. Les deux personnages
 * (« Awa » et « Ibrahim ») sont fictifs, les photos sont volontairement
 * remplacées par le motif « photo protégée » — ce qui illustre au passage la
 * promesse du floutage.
 */

function WindowChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-choco-800/20 bg-ink-900 shadow-[0_50px_110px_-45px_rgba(43,26,18,0.75)]">
      {/* Barre de fenêtre */}
      <div className="relative flex items-center gap-1.5 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/90" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/90" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/90" />
        <span className="absolute left-1/2 -translate-x-1/2 rounded-full bg-cream-50/10 px-4 py-1 text-[11px] font-medium tracking-wide text-cream-50/70">
          <Lock size={9} className="mr-1.5 inline-block" aria-hidden />
          kassalafam.com
        </span>
      </div>
      <div className="bg-cream-50">{children}</div>
    </div>
  );
}

/** Vignette « photo protégée » : dégradé + cadenas, aucune image réelle. */
function ProtectedPhoto({ tall = false }: { tall?: boolean }) {
  return (
    <div
      className={`relative flex w-full items-center justify-center overflow-hidden bg-gradient-to-br from-champagne-300/70 via-cream-100 to-champagne-400/50 ${
        tall ? "aspect-[16/10]" : "h-full"
      }`}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-cream-50/80 text-choco-600 shadow-sm">
        <Lock size={18} />
      </span>
      <span className="absolute bottom-2 right-2 rounded-full bg-ink-900/55 px-2.5 py-1 text-[10px] font-medium text-cream-50">
        Photo protégée
      </span>
    </div>
  );
}

export function ProductWindow() {
  return (
    <section id="decouvrir" className="relative py-20 sm:py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-24 h-80 w-80 -translate-x-1/2 rounded-full bg-champagne-400/15 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Découvrez la plateforme"
          title="Voici à quoi ressemble KASSALAFAM de l'intérieur"
          description="Des profils sérieux, des photos que chacun maîtrise, une messagerie respectueuse. Les profils ci-dessous sont fictifs — votre confidentialité, elle, est bien réelle."
        />

        <Reveal delay={0.1} className="mt-14">
          <WindowChrome>
            <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2 lg:gap-6">
              {/* Volet découverte : une carte de profil (fictive) */}
              <div className="flex flex-col gap-3 rounded-2xl border border-champagne-500/25 bg-cream-100/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-champagne-600">
                  Découverte
                </p>
                <article className="overflow-hidden rounded-2xl border border-champagne-500/30 bg-cream-50">
                  <ProtectedPhoto tall />
                  <div className="flex flex-col gap-2.5 p-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-serif text-lg font-semibold text-choco-700">
                        Awa · 29 ans
                      </h3>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <BadgeCheck size={11} />
                        Vérifiée
                      </span>
                    </div>
                    <p className="flex items-center gap-1.5 text-xs text-ink-700/65">
                      <MapPin size={12} />
                      Douala, Cameroun · souhaite se marier d&apos;ici 2 ans
                    </p>
                    <div className="mt-1 flex gap-2">
                      <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-3 py-2 text-xs font-semibold text-cream-50 ring-1 ring-inset ring-champagne-400/30">
                        <Heart size={13} />
                        Exprimer mon intérêt
                      </span>
                      <span className="inline-flex items-center justify-center rounded-full border border-champagne-500/40 bg-cream-50 px-3 py-2 text-xs font-medium text-choco-700">
                        Voir plus
                      </span>
                    </div>
                  </div>
                </article>
                <p className="flex items-center gap-1.5 text-[11px] text-ink-700/55">
                  <ShieldCheck size={12} className="shrink-0 text-champagne-600" />
                  Chaque profil est validé par notre équipe avant d&apos;apparaître ici.
                </p>
              </div>

              {/* Volet conversation : messagerie (fictive) */}
              <div className="flex flex-col gap-3 rounded-2xl border border-champagne-500/25 bg-cream-100/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-champagne-600">
                  Messagerie sécurisée
                </p>
                <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-champagne-500/30 bg-cream-50">
                  <div className="flex items-center gap-2.5 border-b border-champagne-500/20 px-4 py-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-champagne-500/30 bg-cream-100/70 text-ink-700/40">
                      <UserRound size={16} />
                    </span>
                    <div>
                      <p className="font-serif text-sm font-semibold text-choco-700">
                        Ibrahim · 34 ans
                      </p>
                      <p className="flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                        <BadgeCheck size={10} />
                        Profil vérifié · Intérêt mutuel
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 px-4 py-4">
                    <div className="max-w-[85%] self-start rounded-2xl rounded-bl-md border border-champagne-500/40 bg-champagne-300/60 px-3 py-2 text-xs text-ink-800">
                      Bonjour Awa, votre vision du foyer m&apos;a beaucoup parlé.
                    </div>
                    <div className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-gradient-to-br from-choco-600 to-choco-800 px-3 py-2 text-xs text-cream-50">
                      Merci Ibrahim. J&apos;aimerais d&apos;abord connaître vos valeurs.
                    </div>
                    <div className="max-w-[85%] self-start rounded-2xl rounded-bl-md border border-champagne-500/40 bg-champagne-300/60 px-3 py-2 text-xs text-ink-800">
                      Avec plaisir : la famille d&apos;abord, toujours.
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-t border-champagne-500/20 px-4 py-3">
                    <span className="flex-1 rounded-full border border-champagne-500/40 bg-cream-50/80 px-3.5 py-2 text-xs text-ink-700/40">
                      Écrire un message respectueux…
                    </span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-choco-600 to-choco-800 text-cream-50">
                      <Send size={13} />
                    </span>
                  </div>
                </div>
                <p className="flex items-center gap-1.5 text-[11px] text-ink-700/55">
                  <Lock size={12} className="shrink-0 text-champagne-600" />
                  Messagerie réservée aux intérêts mutuels — jamais de message non sollicité.
                </p>
              </div>
            </div>
          </WindowChrome>
        </Reveal>
      </div>
    </section>
  );
}
