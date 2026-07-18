"use client";

/**
 * Envoi client vers l'ingestion first-party — fire-and-forget.
 *
 * N'envoie JAMAIS : contenu de page, token, UUID, query string complète,
 * email ni texte utilisateur. Le chemin transmis est déjà normalisé (et le
 * serveur RE-normalise de toute façon). `keepalive` permet à l'événement de
 * survivre à une navigation (ex. login_succeeded juste avant redirection).
 */

import {
  normalizePath,
  type AnalyticsEventType,
} from "@/lib/analytics/path-normalization";

export function sendAnalyticsBeacon(
  type: AnalyticsEventType | "heartbeat",
  rawPath: string,
  options?: { search?: string; referrer?: string },
): void {
  const path = normalizePath(rawPath);
  if (!path) return;

  try {
    void fetch("/api/analytics/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        type,
        path,
        search: options?.search ?? "",
        referrer: options?.referrer ?? "",
      }),
    }).catch(() => {
      // Silencieux : l'analytique ne doit jamais perturber l'application.
    });
  } catch {
    // Idem : aucun impact fonctionnel.
  }
}
