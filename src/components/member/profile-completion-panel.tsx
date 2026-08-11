"use client";

import { ArrowDownRight, BadgeCheck, CircleAlert } from "lucide-react";

/**
 * Panneau « Complétez votre profil » — en tête de /profile (inspiration :
 * carte de complétion des plateformes concurrentes).
 *
 * Composant PUR : il ne lit rien lui-même. Le pourcentage est CALCULÉ depuis
 * les éléments fournis par la page (chaque élément = un champ réel du profil),
 * jamais écrit en dur. Chaque manque est un lien d'ancre qui fait défiler
 * jusqu'à la section concernée.
 */

export type ProfileCompletionItem = {
  /** Identifiant stable de l'élément (clé React). */
  id: string;
  /** Libellé humain — « Votre bio », « Photo principale »… */
  label: string;
  /** Renseigné ? */
  done: boolean;
  /** Ancre de la section (« presentation », « photos »…), sans le #. */
  anchor: string;
};

export type ProfileSection = {
  id: string;
  label: string;
  anchor: string;
  /** true = tout ce qui s'y rapporte est renseigné ; undefined = neutre. */
  complete?: boolean;
};

export function ProfileCompletionPanel({
  items,
  sections,
}: {
  items: ProfileCompletionItem[];
  sections: ProfileSection[];
}) {
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const missing = items.filter((i) => !i.done);

  return (
    <section
      aria-label="Complétion du profil"
      className="flex flex-col gap-4 rounded-3xl border border-champagne-500/30 bg-cream-100/50 p-5 sm:p-6"
    >
      {/* Pourcentage + barre */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-lg font-semibold text-choco-700">
            Complétez votre profil
          </h2>
          <p className="mt-0.5 text-xs text-ink-700/65">
            {missing.length === 0
              ? "Tout est renseigné — votre profil est complet."
              : `${done} sur ${total} éléments renseignés.`}
          </p>
        </div>
        <span className="font-serif text-3xl font-semibold tabular-nums text-choco-700">
          {percent}
          <span className="text-base text-champagne-600">%</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`Profil complété à ${percent} %`}
        className="h-2 w-full overflow-hidden rounded-full bg-champagne-500/20"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-champagne-400 to-choco-500 ease-out motion-safe:transition-[width] motion-safe:duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Manques cliquables — trois premiers seulement, pour rester digeste. */}
      {missing.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {missing.slice(0, 3).map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.anchor}`}
                className="group inline-flex items-center gap-2 text-sm font-medium text-choco-700 underline-offset-2 hover:underline"
              >
                <CircleAlert size={14} className="shrink-0 text-champagne-600" />
                {item.label}
                <ArrowDownRight
                  size={13}
                  className="text-ink-700/40 transition-transform group-hover:translate-x-0.5 group-hover:translate-y-0.5"
                />
              </a>
            </li>
          ))}
          {missing.length > 3 ? (
            <li className="text-xs text-ink-700/55">
              … et {missing.length - 3} autre{missing.length - 3 > 1 ? "s" : ""}{" "}
              élément{missing.length - 3 > 1 ? "s" : ""} ci-dessous.
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
          <BadgeCheck size={15} />
          Un profil complet reçoit des mises en relation mieux préparées.
        </p>
      )}

      {/* Sommaire des sections — défilement par ancre, statut réel. */}
      <nav aria-label="Sections du profil" className="border-t border-champagne-500/20 pt-3.5">
        <ul className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.anchor}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-champagne-500/35 bg-cream-50/70 px-3 py-1.5 text-xs font-medium text-choco-700 transition-colors hover:bg-champagne-400/15"
              >
                {section.complete === true ? (
                  <BadgeCheck size={12} className="text-emerald-600" />
                ) : section.complete === false ? (
                  <CircleAlert size={12} className="text-champagne-600" />
                ) : null}
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
