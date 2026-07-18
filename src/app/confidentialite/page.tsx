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
  title: "Politique de confidentialité | KASSALAFAM",
  description:
    "Comment KASSALAFAM collecte, utilise et protège vos données personnelles.",
  path: "/confidentialite",
});

export default function ConfidentialitePage() {
  return (
    <LegalPageShell
      title="Politique de confidentialité"
      updatedAt="10 juillet 2026"
      intro="La confidentialité est au cœur de KASSALAFAM. Cette page explique simplement quelles données nous collectons, pourquoi, et quels sont vos droits."
    >
      <LegalSection title="1. Données collectées">
        <p>Nous collectons uniquement les données utiles au service :</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <span className="font-medium text-choco-700">Compte :</span> email
            et mot de passe (le mot de passe est stocké sous forme chiffrée,
            jamais en clair).
          </li>
          <li>
            <span className="font-medium text-choco-700">
              Profil matrimonial :
            </span>{" "}
            informations renseignées lors de l’onboarding (prénom, âge,
            situation, attentes…) et photos de profil.
          </li>
          <li>
            <span className="font-medium text-choco-700">Échanges :</span>{" "}
            intérêts exprimés et messages envoyés via la messagerie interne.
          </li>
          <li>
            <span className="font-medium text-choco-700">
              Origine d’inscription :
            </span>{" "}
            la réponse facultative « comment nous avez-vous connus ».
          </li>
          <li>
            <span className="font-medium text-choco-700">
              Mesure d’audience interne :
            </span>{" "}
            horodatages de visite, pages consultées sous forme de routes
            génériques (jamais d’identifiant ni de lien précis), domaine du
            site d’origine et éventuels paramètres de campagne (utm). Cette
            mesure est réalisée sur nos propres serveurs, sans service
            analytique tiers ; aucune adresse IP n’est conservée et aucune
            empreinte de navigateur n’est calculée. Les données de visite sont
            conservées au maximum 90 jours (sessions) et 180 jours
            (événements), puis supprimées automatiquement. Elles ne sont
            consultées qu’agrégées, dans notre outil d’administration.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Utilisation des données">
        <p>Vos données servent exclusivement à :</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>créer et vérifier votre profil ;</li>
          <li>
            vous proposer des profils compatibles dans l’espace découverte ;
          </li>
          <li>permettre les mises en relation et la messagerie ;</li>
          <li>
            assurer la sécurité de la communauté (modération, traitement des
            signalements) ;
          </li>
          <li>
            mesurer la fréquentation du service (audience interne, sans
            publicité) ;
          </li>
          <li>améliorer le service.</li>
        </ul>
        <p>
          Vos données ne sont ni vendues, ni louées, ni transmises à des tiers
          à des fins publicitaires.
        </p>
      </LegalSection>

      <LegalSection title="3. Protection de vos photos et de vos échanges">
        <p>
          Vos photos sont stockées dans un espace privé : elles ne sont
          visibles que selon vos réglages (y compris l’option de floutage) et
          servies via des liens temporaires sécurisés, jamais par des adresses
          publiques permanentes.
        </p>
        <p>
          Vos messages ne sont accessibles qu’aux deux participants d’une
          conversation. Un message signalé peut être examiné par la modération,
          uniquement dans le cadre du traitement du signalement.
        </p>
      </LegalSection>

      <LegalSection title="4. Hébergement">
        <p>
          Les données sont hébergées par nos prestataires techniques : Supabase
          (base de données et authentification) et Vercel (hébergement de
          l’application). Ces prestataires appliquent des standards de sécurité
          reconnus.
        </p>
      </LegalSection>

      <LegalSection title="5. Vos droits">
        <p>
          Vous pouvez à tout moment consulter et modifier les informations de
          votre profil depuis votre espace membre. Vous pouvez également
          demander l’accès, la rectification ou la suppression de vos données,
          ainsi que la clôture de votre compte, en nous écrivant à{" "}
          <ContactEmailLink />.
        </p>
      </LegalSection>

      <LegalSection title="6. Contact">
        <p>
          Pour toute question relative à vos données personnelles :{" "}
          <ContactEmailLink />.
        </p>
        <p>
          Le responsable du traitement des données personnelles est TITANEX
          SARL, société à responsabilité limitée unipersonnelle, dont le siège
          social est situé à Douala, New-Bell, face Total New-Bell, Cameroun.
          Ses coordonnées complètes figurent dans les{" "}
          <Link href="/mentions-legales" className={LEGAL_LINK_CLASS}>
            mentions légales
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
