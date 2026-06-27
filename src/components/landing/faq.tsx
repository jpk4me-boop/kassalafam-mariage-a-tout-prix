"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

const FAQ_ITEMS = [
  {
    question: "KASSALAFAM est-il un site de rencontre classique ?",
    answer:
      "Non. KASSALAFAM est une plateforme de mariage sérieuse, confidentielle et orientée foyer. Notre objectif est d'accompagner des personnes réellement prêtes à s'engager, pas de proposer un simple site de drague.",
  },
  {
    question: "Comment mes photos sont-elles protégées ?",
    answer:
      "Par défaut, vos photos sont floutées et ne sont visibles que selon les autorisations que vous accordez. Vous gardez le contrôle de votre image à chaque étape.",
  },
  {
    question: "Les profils sont-ils vraiment vérifiés ?",
    answer:
      "Oui. Chaque profil est examiné manuellement par notre équipe avant d'être publié. Nous luttons activement contre les faux comptes, les arnaques et les profils suspects.",
  },
  {
    question: "Est-ce que le mariage est garanti ?",
    answer:
      "Non, et nous ne le promettons pas. KASSALAFAM met à votre disposition les meilleures conditions pour faire une rencontre sincère et sérieuse. La suite dépend de votre histoire et de vos choix.",
  },
  {
    question: "Combien coûte la plateforme ?",
    answer:
      "L'inscription et la création de profil sont gratuites. Une offre Premium avec des fonctionnalités avancées sera disponible prochainement, avec paiement par Mobile Money.",
  },
  {
    question: "Mes données sont-elles confidentielles ?",
    answer:
      "La confidentialité est au cœur de KASSALAFAM. Vos informations sont protégées et ne sont jamais utilisées à des fins étrangères à votre recherche d'un futur conjoint.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeadingInline />

        <div className="mt-12 flex flex-col gap-3">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <Reveal key={item.question} delay={i * 0.05}>
                <div
                  className={cn(
                    "overflow-hidden rounded-2xl border transition-colors duration-300",
                    isOpen
                      ? "border-champagne-500/45 bg-cream-100"
                      : "border-champagne-500/20 bg-cream-100/50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
                  >
                    <span className="font-medium text-choco-700">
                      {item.question}
                    </span>
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-champagne-400/20 text-choco-600 transition-transform duration-300",
                        isOpen && "rotate-45",
                      )}
                    >
                      <Plus size={16} />
                    </span>
                  </button>
                  <div
                    className={cn(
                      "grid transition-all duration-300 ease-out",
                      isOpen
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 pb-5 text-sm leading-relaxed text-ink-700/80 sm:px-6">
                        {item.answer}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SectionHeadingInline() {
  return (
    <Reveal className="flex flex-col items-center gap-4 text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-champagne-500/40 bg-champagne-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-choco-600">
        <span className="h-1.5 w-1.5 rounded-full bg-champagne-500" />
        Questions fréquentes
      </span>
      <h2 className="font-serif text-3xl leading-tight text-choco-700 sm:text-4xl">
        Tout ce que vous devez savoir
      </h2>
      <p className="max-w-xl text-base leading-relaxed text-ink-700/80">
        Une question subsiste ? Notre équipe reste disponible pour vous
        accompagner.
      </p>
    </Reveal>
  );
}
