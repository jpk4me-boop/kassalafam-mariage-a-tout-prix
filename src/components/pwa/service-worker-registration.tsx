"use client";

import { useEffect } from "react";

/**
 * Enregistrement du service worker (public/sw.js), monté une seule fois
 * dans le layout racine.
 *
 *  - Production uniquement : en développement, un SW fantôme fausse le
 *    hot-reload et les tests ;
 *  - échec silencieux : le SW est une amélioration progressive, jamais
 *    un prérequis ;
 *  - portée racine "/" implicite (sw.js est servi à la racine).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* Amélioration progressive : on n'interrompt jamais l'utilisateur. */
    });
  }, []);

  return null;
}
