import type { Metadata } from "next";

import {
  ContactEmailLink,
  LegalPageShell,
  LegalSection,
} from "@/components/legal/legal-page-shell";
import { buildPublicPageMetadata } from "@/lib/seo-metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Cookies | KASSALAFAM",
  description:
    "Utilisation des cookies sur KASSALAFAM : uniquement des cookies nécessaires au fonctionnement, sans publicité ni traçage.",
  path: "/cookies",
});

export default function CookiesPage() {
  return (
    <LegalPageShell
      title="Cookies"
      updatedAt="10 juillet 2026"
      intro="KASSALAFAM utilise uniquement des cookies nécessaires au fonctionnement du service. Aucun cookie publicitaire, aucun traçage à des fins marketing."
    >
      <LegalSection title="Cookies strictement nécessaires">
        <p>Deux usages seulement, indispensables au service :</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <span className="font-medium text-choco-700">
              Cookies de session :
            </span>{" "}
            ils maintiennent votre connexion sécurisée à votre espace membre
            (authentification). Sans eux, il faudrait vous reconnecter à chaque
            page.
          </li>
          <li>
            <span className="font-medium text-choco-700">
              Cookie d’onboarding « Continuer plus tard » :
            </span>{" "}
            si vous choisissez de terminer votre profil plus tard, un cookie de
            session mémorise ce choix, uniquement pour votre compte et le temps
            de votre navigation.
          </li>
          <li>
            <span className="font-medium text-choco-700">
              Cookie de mesure d’audience interne :
            </span>{" "}
            un identifiant technique aléatoire (sans lien avec un profil
            publicitaire) permet de compter les visites et les pages consultées
            directement sur nos propres serveurs, sans aucun service tiers. Il
            ne contient aucune donnée personnelle et expire au bout de 90
            jours.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Stockage local du navigateur">
        <p>
          Si vous cochez « Se souvenir de moi » à la connexion, votre adresse
          email (et elle seule, jamais votre mot de passe) est mémorisée
          localement dans votre navigateur pour préremplir le formulaire. Vous
          pouvez l’effacer en décochant l’option ou en vidant les données de
          votre navigateur.
        </p>
      </LegalSection>

      <LegalSection title="Pas de publicité, pas de traçage">
        <p>
          La plateforme n’utilise ni cookie publicitaire, ni pixel de suivi,
          ni revente de données de navigation. La mesure d’audience est
          réalisée en interne (« first-party ») : aucun service analytique
          tiers (Google Analytics, Meta Pixel ou équivalent) n’est installé,
          aucune adresse IP n’est conservée, aucune empreinte de votre
          navigateur n’est calculée et aucun suivi entre sites ou entre
          appareils n’est effectué.
        </p>
        <p>
          Si cela devait évoluer, cette page serait mise à jour et votre
          consentement serait demandé au préalable.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Une question sur les cookies ou vos données : <ContactEmailLink />.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
