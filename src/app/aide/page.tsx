import type { Metadata } from "next";
import Link from "next/link";

import {
  ContactEmailLink,
  LegalPageShell,
  LegalSection,
} from "@/components/legal/legal-page-shell";
import { buildPublicPageMetadata } from "@/lib/seo-metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Centre d’aide | KASSALAFAM",
  description:
    "Aide, contact, conseils de sécurité et signalement d’un profil sur KASSALAFAM — Mariage à Tout Prix.",
  path: "/aide",
});

/** Conseils de sécurité affichés dans la section #securite. */
const SAFETY_TIPS = [
  "N’envoyez jamais d’argent à une personne rencontrée sur la plateforme, quelle que soit la raison invoquée.",
  "Gardez vos échanges dans la messagerie KASSALAFAM : elle est encadrée et permet le signalement en cas de problème.",
  "Ne partagez pas trop vite vos coordonnées personnelles (téléphone, adresse, réseaux sociaux).",
  "Prenez le temps de connaître la personne avant toute rencontre, et prévenez un proche pour un premier rendez-vous dans un lieu public.",
  "Méfiez-vous des profils qui pressent la relation, évoquent rapidement des difficultés financières ou refusent tout appel vidéo.",
  "Signalez sans hésiter tout comportement suspect : cela protège toute la communauté.",
];

export default function AidePage() {
  return (
    <LegalPageShell
      title="Centre d’aide"
      intro="Vous trouverez ici les réponses aux questions les plus courantes, nos conseils de sécurité et la marche à suivre pour nous contacter ou signaler un profil."
    >
      <LegalSection title="Questions fréquentes">
        <p>
          Les réponses aux questions les plus courantes (fonctionnement,
          vérification des profils, formules) sont regroupées dans la FAQ de la
          page d’accueil.
        </p>
        <p>
          <Link
            href="/#faq"
            className="font-medium text-choco-600 underline decoration-champagne-500/50 underline-offset-2 transition-colors hover:text-choco-800"
          >
            Consulter la FAQ
          </Link>
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Nous contacter">
        <p>
          Pour toute question sur votre compte, votre inscription ou le
          fonctionnement de la plateforme, écrivez-nous à{" "}
          <ContactEmailLink />. Nous vous répondrons dans les meilleurs délais.
        </p>
        <p>
          Merci de préciser l’adresse email associée à votre compte pour nous
          aider à traiter votre demande plus rapidement.
        </p>
      </LegalSection>

      <LegalSection id="securite" title="Conseils de sécurité">
        <p>
          KASSALAFAM vérifie les profils et modère la plateforme, mais votre
          vigilance reste votre meilleure protection. Quelques réflexes
          simples :
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          {SAFETY_TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection id="signaler" title="Signaler un profil">
        <p>
          Si un membre adopte un comportement inapproprié (harcèlement, demande
          d’argent, usurpation d’identité, contenu déplacé…), vous pouvez le
          signaler directement depuis vos conversations : ouvrez l’échange
          concerné puis utilisez « Signaler ce message » sous le message reçu.
          Chaque signalement est examiné par notre équipe de modération.
        </p>
        <p>
          Vous pouvez aussi bloquer un membre à tout moment depuis la
          conversation : il ne pourra plus vous écrire, sans en être notifié.
        </p>
        <p>
          Pour une situation qui ne concerne pas un message précis (profil
          suspect croisé dans la découverte, problème hors de la plateforme),
          écrivez-nous à <ContactEmailLink /> en décrivant les faits.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
