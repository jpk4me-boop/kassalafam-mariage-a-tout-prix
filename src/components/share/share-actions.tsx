"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Share2,
  Copy,
  Check,
  MessageCircle,
  Send,
  ChevronDown,
  X as CloseIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

// `useSyncExternalStore` sans abonnement : renvoie `false` au rendu serveur et
// au premier rendu client (hydratation cohérente), puis `true` ensuite. C'est
// le motif recommandé pour détecter le client sans setState dans un effet.
const noopSubscribe = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

type ShareActionsProps = {
  /** Lien à partager. Peut être vide tant que l'origine n'est pas résolue côté client. */
  url: string;
  /** Titre du partage natif. */
  title: string;
  /** Message accompagnant le partage (natif + réseaux). */
  text: string;
  /**
   * "panel"   : partage natif (si dispo) + grille de réseaux — bloc application.
   * "compact" : bouton « Partager » + panneau dépliable de réseaux — bloc QR.
   */
  variant?: "panel" | "compact";
  /** Action optionnelle affichée à gauche du bouton « Partager » en mode compact (ex. Télécharger). */
  leadingAction?: ReactNode;
  className?: string;
};

/**
 * Glyphe de marque Facebook. `lucide-react` (v1.21.0) n'expose pas d'icône
 * Facebook : on la fournit en SVG inline pour éviter toute dépendance.
 */
function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      className={className}
    >
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z" />
    </svg>
  );
}

/** Glyphe de marque Instagram (absent de lucide-react). SVG inline, style contour. */
function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

/** Glyphe de marque X (ex-Twitter, absent de lucide-react). SVG inline. */
function XGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      className={className}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const BTN_BASE =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50 disabled:cursor-not-allowed disabled:opacity-60";

const BTN_PRIMARY =
  "bg-gradient-to-br from-choco-600 to-choco-800 text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 hover:-translate-y-0.5";

const BTN_SECONDARY =
  "border border-champagne-500/30 bg-cream-100/60 text-choco-700 hover:bg-champagne-400/15";

// Bouton de réseau (grille) : un peu plus compact pour tenir à deux colonnes dès 320 px.
const BTN_NET =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-champagne-500/30 bg-cream-100/60 px-3 py-2.5 text-sm font-semibold text-choco-700 transition-all hover:bg-champagne-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50 disabled:cursor-not-allowed disabled:opacity-60";

/** Lien de partage externe (nouvel onglet, sécurisé, désactivé tant que l'URL n'est pas prête). */
function ShareLink({
  href,
  ready,
  children,
}: {
  href: string;
  ready: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={ready ? href : undefined}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={!ready}
      className={cn(BTN_NET, !ready && "pointer-events-none opacity-60")}
    >
      {children}
    </a>
  );
}

export function ShareActions({
  url,
  title,
  text,
  variant = "panel",
  leadingAction,
  className,
}: ShareActionsProps) {
  // On ne détecte le partage natif qu'après hydratation pour éviter toute
  // divergence serveur / client (le serveur ne connaît pas `navigator`).
  const hydrated = useHydrated();
  const [copied, setCopied] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Panneau compact ouvert : focus sur le bouton de fermeture + fermeture au clavier (Escape).
  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const canNativeShare =
    hydrated &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function";

  // L'URL peut être vide le temps que l'origine se résolve côté client.
  const ready = url.length > 0;

  const flash = useCallback((message: string, markCopied = false) => {
    if (markCopied) setCopied(true);
    setAnnounce(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setAnnounce("");
    }, 3000);
  }, []);

  // Copie robuste : Clipboard API, avec repli `execCommand` si l'API est
  // absente OU rejette (contexte non focalisé, permission refusée, Safari…).
  const copyToClipboard = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return true;
      }
      throw new Error("clipboard-api-unavailable");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  }, [url]);

  const copyLink = useCallback(async () => {
    if (!ready) return;
    const ok = await copyToClipboard();
    flash(ok ? "Lien copié" : "Échec de la copie du lien", ok);
  }, [ready, copyToClipboard, flash]);

  const nativeShare = useCallback(async () => {
    if (!ready) return;
    try {
      await navigator.share({ title, text, url });
    } catch (err) {
      // Fermeture volontaire de la feuille de partage : ne rien signaler.
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Autre erreur : repli silencieux sur la copie du lien.
      await copyLink();
    }
  }, [ready, title, text, url, copyLink]);

  // Instagram : pas d'endpoint web de préremplissage. Partage natif si possible,
  // sinon copie du lien + ouverture d'Instagram (sans prétendre publier).
  const shareInstagram = useCallback(async () => {
    if (!ready) return;
    if (canNativeShare) {
      flash("Choisissez Instagram dans le menu de partage.");
      try {
        await navigator.share({ title, text, url });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
      return;
    }
    const ok = await copyToClipboard();
    flash(
      ok
        ? "Lien copié — collez-le dans Instagram."
        : "Échec de la copie du lien",
      ok,
    );
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
  }, [ready, canNativeShare, title, text, url, copyToClipboard, flash]);

  // Chaque paramètre est encodé une seule fois.
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
  const telegramHref = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const xHref = `https://x.com/intent/tweet?text=${encodeURIComponent(`${text}\n${url}`)}`;

  const liveRegion = (
    <span role="status" aria-live="polite" className="sr-only">
      {announce}
    </span>
  );

  // Grille des réseaux — ordre : WhatsApp, Telegram, Facebook, Instagram, X, Copier.
  const networkGrid = (
    <div className="grid grid-cols-2 gap-2.5">
      <ShareLink href={whatsappHref} ready={ready}>
        <MessageCircle size={16} className="text-[#25D366]" />
        WhatsApp
      </ShareLink>

      <ShareLink href={telegramHref} ready={ready}>
        <Send size={16} className="text-[#229ED9]" />
        Telegram
      </ShareLink>

      <ShareLink href={facebookHref} ready={ready}>
        <FacebookGlyph className="h-4 w-4 text-[#1877F2]" />
        Facebook
      </ShareLink>

      <button
        type="button"
        onClick={shareInstagram}
        disabled={!ready}
        className={BTN_NET}
      >
        <InstagramGlyph className="h-4 w-4 text-[#E4405F]" />
        Instagram
      </button>

      <ShareLink href={xHref} ready={ready}>
        <XGlyph className="h-4 w-4 text-ink-800" />X
      </ShareLink>

      <button
        type="button"
        onClick={copyLink}
        disabled={!ready}
        className={BTN_NET}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? "Lien copié" : "Copier le lien"}
      </button>
    </div>
  );

  if (variant === "compact") {
    return (
      <div className={cn("flex w-full flex-col gap-3", className)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {leadingAction}
          <button
            type="button"
            onClick={canNativeShare ? nativeShare : () => setOpen((v) => !v)}
            disabled={!ready}
            aria-expanded={canNativeShare ? undefined : open}
            aria-controls={canNativeShare ? undefined : panelId}
            className={cn(BTN_BASE, BTN_PRIMARY, "w-full")}
          >
            <Share2 size={16} />
            Partager
          </button>
        </div>

        {/* Un accès aux autres options reste toujours visible, même quand le
            partage natif est disponible. */}
        {canNativeShare ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={!ready}
            aria-expanded={open}
            aria-controls={panelId}
            className={cn(BTN_BASE, BTN_SECONDARY, "w-full")}
          >
            Autres options
            <ChevronDown
              size={16}
              className={cn("transition-transform", open && "rotate-180")}
            />
          </button>
        ) : null}

        {open ? (
          <div
            id={panelId}
            role="region"
            aria-label="Autres options de partage"
            className="rounded-2xl border border-champagne-500/30 bg-cream-50/70 p-3"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-choco-700">
                Partager le lien d&apos;inscription
              </span>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer les options de partage"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-champagne-500/30 bg-cream-100/60 text-choco-700 transition-colors hover:bg-champagne-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60"
              >
                <CloseIcon size={16} />
              </button>
            </div>
            {networkGrid}
          </div>
        ) : null}

        {liveRegion}
      </div>
    );
  }

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {canNativeShare ? (
        <button
          type="button"
          onClick={nativeShare}
          disabled={!ready}
          className={cn(BTN_BASE, BTN_PRIMARY, "w-full")}
        >
          <Share2 size={16} />
          Partager
        </button>
      ) : null}

      {networkGrid}
      {liveRegion}
    </div>
  );
}
