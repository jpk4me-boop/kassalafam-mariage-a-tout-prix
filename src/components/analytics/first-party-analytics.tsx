"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { sendAnalyticsBeacon } from "@/lib/analytics/client";
import {
  normalizePath,
  HEARTBEAT_INTERVAL_MS,
} from "@/lib/analytics/path-normalization";

/**
 * Tracker first-party global (monté une seule fois dans le layout racine).
 *
 *  - page vue à chaque changement de ROUTE NORMALISÉE (les changements de
 *    query string seule sont ignorés) ;
 *  - heartbeat toutes les 60 s UNIQUEMENT quand l'onglet est visible, plus un
 *    heartbeat au retour au premier plan ;
 *  - UTM (allowlist) + hostname du référent envoyés UNIQUEMENT avec la
 *    première page vue du chargement (first-touch, protégé aussi en base) ;
 *  - Do Not Track : un visiteur ANONYME avec DNT n'émet AUCUN événement de
 *    trafic ; l'activité opérationnelle d'un MEMBRE authentifié (timestamp +
 *    route normalisée, rien d'autre) reste enregistrée pour la sécurité du
 *    compte ;
 *  - ne lit jamais le contenu des pages ; n'envoie jamais token/UUID bruts.
 */
export function FirstPartyAnalytics() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);
  const firstBeaconSent = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function shouldTrack(): Promise<boolean> {
      const dnt =
        typeof navigator !== "undefined" && navigator.doNotTrack === "1";
      if (!dnt) return true;
      // DNT actif : seuls les membres authentifiés gardent leur activité
      // opérationnelle. getSession lit le stockage local (aucun appel réseau).
      try {
        const { data } = await createClient().auth.getSession();
        return data.session != null;
      } catch {
        return false;
      }
    }

    async function trackNavigation() {
      const normalized = normalizePath(pathname);
      if (!normalized || normalized === lastTrackedPath.current) return;
      if (!(await shouldTrack()) || cancelled) return;
      lastTrackedPath.current = normalized;

      // First-touch : UTM + référent uniquement au premier envoi du chargement.
      const isFirst = !firstBeaconSent.current;
      firstBeaconSent.current = true;
      sendAnalyticsBeacon("page_view", normalized, {
        search: isFirst ? window.location.search : "",
        referrer: isFirst ? document.referrer : "",
      });
    }

    async function heartbeat() {
      if (document.visibilityState !== "visible") return;
      const normalized = normalizePath(pathname);
      if (!normalized) return;
      if (!(await shouldTrack()) || cancelled) return;
      sendAnalyticsBeacon("heartbeat", normalized);
    }

    void trackNavigation();

    // Un seul intervalle actif à la fois (remplacé à chaque navigation).
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => void heartbeat(), HEARTBEAT_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void heartbeat();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  return null;
}
