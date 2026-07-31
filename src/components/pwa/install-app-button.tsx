"use client";

import { useCallback, useEffect, useState } from "react";
import { Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Événement `beforeinstallprompt` (Chrome/Edge/Samsung Internet — hors spec,
 * donc absent des types DOM standard). `prompt()` ne peut être appelé qu'une
 * seule fois par événement.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/**
 * Carte « Installer l'application » (PWA).
 *
 *  - Amélioration progressive : rendue uniquement si le navigateur a émis
 *    `beforeinstallprompt` (Chrome/Edge Android et desktop). Sur iOS Safari
 *    ou si l'app est déjà installée, le composant ne rend rien — aucune
 *    section vide, aucune promesse impossible à tenir ;
 *  - jamais de mini-infobar : `preventDefault()` sur l'événement, l'invite
 *    n'apparaît qu'au clic de l'utilisateur (exigence Chrome) ;
 *  - `prompt()` consommé une seule fois : l'événement est retiré de l'état
 *    avant l'appel ; si le navigateur ré-émet `beforeinstallprompt` plus
 *    tard, la carte réapparaît d'elle-même ;
 *  - masquée en mode standalone (app déjà ouverte depuis l'écran d'accueil)
 *    et après `appinstalled` ;
 *  - aucun stockage local : uniquement l'état React de la session.
 */
export function InstallAppCard({ className }: { className?: string }) {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Déjà installée et ouverte en standalone : ne jamais proposer.
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const onBeforeInstallPrompt = (event: Event) => {
      // Empêche la mini-infobar Chrome : l'installation se déclenche
      // uniquement depuis notre bouton.
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => setInstallEvent(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installEvent) return;
    // `prompt()` est à usage unique : on retire l'événement de l'état avant
    // l'appel pour ne jamais retenter avec un événement consommé.
    setInstallEvent(null);
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } catch {
      /* Amélioration progressive : jamais bloquant pour l'utilisateur. */
    }
  }, [installEvent]);

  // Serveur et premier rendu client : null → aucune divergence d'hydratation.
  if (!installEvent) return null;

  return (
    <section
      className={cn(
        "rounded-3xl border border-champagne-500/25 bg-cream-100/40 p-5 sm:p-7",
        className,
      )}
    >
      <h2 className="font-serif text-lg font-semibold text-choco-700">
        Installer l&apos;application
      </h2>
      <p className="mt-1 text-sm text-ink-700/70">
        Ajoutez KASSALAFAM à votre écran d&apos;accueil pour y accéder d&apos;un
        geste, comme une application.
      </p>
      <button
        type="button"
        onClick={handleInstall}
        className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50 sm:w-auto"
      >
        <Smartphone size={16} aria-hidden="true" />
        Installer l&apos;application
      </button>
    </section>
  );
}
