import type { Metadata } from "next";
import Link from "next/link";

import {
  ContactEmailLink,
  LEGAL_LINK_CLASS,
  LegalPageShell,
  LegalSection,
} from "@/components/legal/legal-page-shell";
import { buildPublicPageMetadata } from "@/lib/seo-metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Conditions d’utilisation | KASSALAFAM",
  description:
    "Conditions d’utilisation de la plateforme de rencontre matrimoniale KASSALAFAM — Mariage à Tout Prix.",
  path: "/conditions-utilisation",
});

export default function ConditionsUtilisationPage() {
  return (
    <LegalPageShell
      title="Conditions d’utilisation"
      updatedAt="10 juillet 2026"
      intro="Ces conditions encadrent l’utilisation de KASSALAFAM. En créant un compte, vous les acceptez. Elles pourront évoluer avec la plateforme ; la version en vigueur est celle publiée sur cette page."
    >
      <LegalSection title="1. Objet du service">
        <p>
          KASSALAFAM — Mariage à Tout Prix est une plateforme de mise en
          relation destinée aux personnes qui recherchent une relation sérieuse
          en vue du mariage. Elle propose la création d’un profil matrimonial,
          la découverte de profils compatibles, l’expression d’intérêts mutuels
          et une messagerie privée entre membres.
        </p>
        <p>
          KASSALAFAM est un service de mise en relation : la plateforme ne
          garantit ni rencontre, ni mariage, et n’intervient pas dans les
          relations entre membres en dehors des outils qu’elle fournit.
        </p>
      </LegalSection>

      <LegalSection title="2. Conditions d’accès">
        <p>
          L’inscription est réservée aux personnes majeures (18 ans ou plus),
          juridiquement capables et recherchant une relation en vue du mariage.
          Vous vous engagez à fournir des informations exactes et à maintenir
          votre profil à jour.
        </p>
        <p>
          Chaque compte est strictement personnel : il ne peut être ni cédé, ni
          partagé, ni créé au nom d’un tiers.
        </p>
      </LegalSection>

      <LegalSection title="3. Comportement des membres">
        <p>Sur KASSALAFAM, chaque membre s’engage à :</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>rester courtois et respectueux dans tous ses échanges ;</li>
          <li>
            ne pas publier de contenu contraire à la loi, haineux, à caractère
            sexuel ou trompeur ;
          </li>
          <li>
            ne jamais solliciter d’argent ni proposer de services commerciaux
            aux autres membres ;
          </li>
          <li>ne pas usurper l’identité d’un tiers ;</li>
          <li>
            ne pas utiliser la plateforme à des fins autres que la recherche
            d’une relation sérieuse.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Vérification des profils et modération">
        <p>
          Les profils font l’objet d’une vérification avant d’accéder aux
          fonctionnalités de rencontre. La plateforme dispose d’outils de
          signalement et de blocage, et une équipe de modération examine les
          signalements.
        </p>
        <p>
          En cas de manquement à ces conditions, KASSALAFAM peut suspendre ou
          clôturer un compte, à titre temporaire ou définitif, après examen de
          la situation.
        </p>
      </LegalSection>

      <LegalSection title="5. Responsabilité">
        <p>
          KASSALAFAM met en œuvre des moyens raisonnables pour assurer la
          qualité et la sécurité du service (vérification des profils,
          modération, messagerie encadrée), sans pouvoir garantir l’exactitude
          des informations fournies par les membres ni le comportement de
          chacun.
        </p>
        <p>
          Restez vigilant dans vos échanges et consultez nos conseils de
          sécurité dans le centre d’aide. Le service est fourni « en l’état »
          et peut évoluer ou être temporairement interrompu pour maintenance.
        </p>
      </LegalSection>

      <LegalSection title="6. Contact">
        <p>
          Pour toute question relative à ces conditions : <ContactEmailLink />.
        </p>
        <p className="text-ink-700/60">
          Les informations d’identification de l’entité éditrice figurent dans
          les{" "}
          <Link href="/mentions-legales" className={LEGAL_LINK_CLASS}>
            mentions légales
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
