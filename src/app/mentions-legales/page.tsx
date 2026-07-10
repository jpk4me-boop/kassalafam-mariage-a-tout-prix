import type { Metadata } from "next";
import Link from "next/link";

import {
  CONTACT_PHONE,
  CONTACT_PHONE_HREF,
  ContactEmailLink,
  EDITOR_EMAIL,
  LEGAL_LINK_CLASS,
  LegalPageShell,
  LegalSection,
} from "@/components/legal/legal-page-shell";

export const metadata: Metadata = {
  title: "Mentions légales | KASSALAFAM",
  description:
    "Mentions légales de la plateforme KASSALAFAM — Mariage à Tout Prix.",
};

/**
 * Informations officielles d’identification de l’éditeur (TITANEX SARL),
 * fournies par le propriétaire de la plateforme. Le RCCM et le NIU sont
 * affichés exactement tels que communiqués.
 */
const EDITOR_FIELDS = [
  { label: "Raison sociale", value: "TITANEX SARL" },
  {
    label: "Forme juridique",
    value:
      "Société à responsabilité limitée unipersonnelle (SARL unipersonnelle)",
  },
  { label: "Capital social", value: "1 000 000 FCFA" },
  {
    label: "Siège social",
    value: "Douala, New-Bell, face Total New-Bell, Cameroun",
  },
  { label: "Pays d’immatriculation", value: "Cameroun" },
  { label: "Responsable de publication", value: "KENNE Jean Pierre" },
  { label: "RCCM", value: "CM-DLA-02-2026-B13-00145" },
  { label: "NIU / numéro de contribuable", value: "M022618389246M" },
];

export default function MentionsLegalesPage() {
  return (
    <LegalPageShell
      title="Mentions légales"
      updatedAt="10 juillet 2026"
      intro="Informations légales relatives à l’édition et à l’hébergement de la plateforme KASSALAFAM — Mariage à Tout Prix."
    >
      <LegalSection title="Éditeur de la plateforme">
        <dl className="flex flex-col gap-2">
          {EDITOR_FIELDS.map((field) => (
            <div key={field.label} className="flex flex-col sm:flex-row sm:gap-2">
              <dt className="shrink-0 font-medium text-choco-700 sm:w-56">
                {field.label}
              </dt>
              <dd className="text-ink-700/70">{field.value}</dd>
            </div>
          ))}
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <dt className="shrink-0 font-medium text-choco-700 sm:w-56">
              Téléphone
            </dt>
            <dd className="text-ink-700/70">
              <a href={CONTACT_PHONE_HREF} className={LEGAL_LINK_CLASS}>
                {CONTACT_PHONE}
              </a>
            </dd>
          </div>
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <dt className="shrink-0 font-medium text-choco-700 sm:w-56">
              Courriel de l’éditeur
            </dt>
            <dd className="text-ink-700/70">
              <a href={`mailto:${EDITOR_EMAIL}`} className={LEGAL_LINK_CLASS}>
                {EDITOR_EMAIL}
              </a>
            </dd>
          </div>
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

      <LegalSection title="Documents associés">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <Link href="/confidentialite" className={LEGAL_LINK_CLASS}>
              Politique de confidentialité
            </Link>
          </li>
          <li>
            <Link href="/conditions-utilisation" className={LEGAL_LINK_CLASS}>
              Conditions d’utilisation
            </Link>
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Pour toute question ou demande relative à ces mentions :{" "}
          <ContactEmailLink /> ou par téléphone au{" "}
          <a href={CONTACT_PHONE_HREF} className={LEGAL_LINK_CLASS}>
            {CONTACT_PHONE}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
