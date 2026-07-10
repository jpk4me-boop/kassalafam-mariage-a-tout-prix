import type { Metadata } from "next";

import {
  ContactEmailLink,
  LegalPageShell,
  LegalSection,
} from "@/components/legal/legal-page-shell";

export const metadata: Metadata = {
  title: "Mentions légales | KASSALAFAM",
  description:
    "Mentions légales de la plateforme KASSALAFAM — Mariage à Tout Prix.",
};

/**
 * Informations éditeur à fournir par le propriétaire de la plateforme.
 * Les valeurs « [À COMPLÉTER] » sont volontairement visibles pour être
 * remplacées dès que les informations officielles seront disponibles.
 */
const EDITOR_FIELDS = [
  { label: "Nom de l’entité", value: "[À COMPLÉTER]" },
  { label: "Forme juridique", value: "[À COMPLÉTER]" },
  { label: "Adresse", value: "[À COMPLÉTER]" },
  { label: "Pays d’immatriculation", value: "[À COMPLÉTER]" },
  { label: "Responsable de publication", value: "[À COMPLÉTER]" },
  {
    label: "Numéro d’immatriculation",
    value: "[À COMPLÉTER — si applicable]",
  },
];

export default function MentionsLegalesPage() {
  return (
    <LegalPageShell
      title="Mentions légales"
      updatedAt="10 juillet 2026"
      intro="Informations légales relatives à l’édition et à l’hébergement de la plateforme KASSALAFAM — Mariage à Tout Prix."
    >
      <LegalSection title="Éditeur de la plateforme">
        <p className="rounded-2xl border border-champagne-500/40 bg-champagne-400/10 px-4 py-3 text-choco-700">
          Les informations d’identification de l’éditeur sont en cours de
          finalisation et seront publiées ici prochainement.
        </p>
        <dl className="flex flex-col gap-2">
          {EDITOR_FIELDS.map((field) => (
            <div key={field.label} className="flex flex-col sm:flex-row sm:gap-2">
              <dt className="shrink-0 font-medium text-choco-700 sm:w-56">
                {field.label}
              </dt>
              <dd className="text-ink-700/70">{field.value}</dd>
            </div>
          ))}
        </dl>
      </LegalSection>

      <LegalSection title="Hébergement">
        <p>
          L’application est hébergée par Vercel Inc. (440 N Barranca Ave #4133,
          Covina, CA 91723, États-Unis — vercel.com).
        </p>
        <p>
          Les données (base de données, authentification, stockage des photos)
          sont hébergées par Supabase Inc. (supabase.com).
        </p>
      </LegalSection>

      <LegalSection title="Propriété intellectuelle">
        <p>
          La marque KASSALAFAM, le logo, les textes et l’ensemble des éléments
          de la plateforme sont protégés. Toute reproduction ou utilisation non
          autorisée est interdite.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Pour toute question ou demande relative à ces mentions :{" "}
          <ContactEmailLink />.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
