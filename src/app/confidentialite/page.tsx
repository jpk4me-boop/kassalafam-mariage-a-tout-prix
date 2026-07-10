import type { Metadata } from "next";

import {
  ContactEmailLink,
  LegalPageShell,
  LegalSection,
} from "@/components/legal/legal-page-shell";

export const metadata: Metadata = {
  title: "Politique de confidentialité | KASSALAFAM",
  description:
    "Comment KASSALAFAM collecte, utilise et protège vos données personnelles.",
};

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
        <p className="text-ink-700/60">
          L’identité complète de l’entité responsable du traitement sera
          précisée dans les mentions légales, en cours de finalisation.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
