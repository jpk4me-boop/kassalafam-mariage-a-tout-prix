"use client";

import { Lightbulb } from "lucide-react";

/**
 * Conseil du jour (Lot G).
 *
 * DEUX RÈGLES TENUES ICI :
 *
 *   · **Rien de religieux.** Trois univers cohabitent sur Kassalafam — chrétien,
 *     islamique, pour tous. Un rappel confessionnel affiché à tout le monde
 *     exclurait une partie des membres sur l'écran le plus fréquenté de
 *     l'application. Les conseils portent donc sur la DÉMARCHE : soigner son
 *     profil, écrire sincèrement, prendre son temps, se protéger.
 *
 *   · **Rien qui promette une fonction absente.** Chaque conseil renvoie à un
 *     geste réellement disponible aujourd'hui.
 *
 * Le conseil change chaque jour, à partir de la date locale du membre : même
 * conseil toute la journée, sans stockage, sans requête.
 */

const CONSEILS = [
  {
    titre: "Une photo change tout",
    texte:
      "Un profil avec une photo principale reçoit nettement plus de visites. Vos photos restent floutées par défaut : vous seul décidez de les ouvrir.",
  },
  {
    titre: "Écrivez comme vous parlez",
    texte:
      "Quelques phrases sincères valent mieux qu'une longue liste. Dites ce que vous cherchez vraiment dans un foyer — c'est ce que les autres lisent en premier.",
  },
  {
    titre: "La patience fait le tri",
    texte:
      "Ici, on ne cherche pas le volume. Prenez le temps d'ouvrir un profil, de lire ses attentes, puis d'exprimer un intérêt seulement s'il vous parle.",
  },
  {
    titre: "Votre discrétion vous appartient",
    texte:
      "Visites discrètes, favoris discrets, photos floutées : trois réglages dans votre profil pour avancer à votre rythme, sans être observé.",
  },
  {
    titre: "Complétez, puis laissez faire",
    texte:
      "Origine, résidence, situation, attentes : plus votre profil est complet, plus les suggestions vous ressemblent. C'est vous qui nourrissez l'algorithme.",
  },
  {
    titre: "Un intérêt n'engage pas l'autre",
    texte:
      "Exprimer un intérêt est une main tendue, jamais une obligation. La conversation ne s'ouvre que si l'intérêt devient mutuel — des deux côtés.",
  },
  {
    titre: "Signalez sans hésiter",
    texte:
      "Un message déplacé n'a pas sa place ici. Le signalement est anonyme et lu par notre équipe : il protège aussi les autres membres.",
  },
];

/** Index stable pour la journée en cours (fuseau du membre). */
function conseilDuJour() {
  const maintenant = new Date();

  const jours = Math.floor(
    Date.UTC(
      maintenant.getFullYear(),
      maintenant.getMonth(),
      maintenant.getDate(),
    ) / 86_400_000,
  );

  return CONSEILS[((jours % CONSEILS.length) + CONSEILS.length) % CONSEILS.length];
}

export function DashboardDailyTip() {
  const conseil = conseilDuJour();

  return (
    <section className="flex items-start gap-3 rounded-3xl border border-champagne-500/30 bg-cream-100/50 p-5 sm:p-6">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
        <Lightbulb size={18} />
      </span>

      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-champagne-700">
          Conseil du jour
        </p>
        <h2 className="mt-1 font-serif text-lg font-semibold text-choco-700">
          {conseil.titre}
        </h2>
        <p className="mt-1 text-sm leading-6 text-ink-700/75">{conseil.texte}</p>
      </div>
    </section>
  );
}
