"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

/**
 * Boutons flottants « Vers le haut » / « Vers le bas », montés une seule fois
 * dans le layout racine (donc présents sur toutes les pages).
 *
 *  - visibles uniquement lorsque la page est réellement défilable ;
 *  - « Vers le haut » masqué en haut de page, « Vers le bas » masqué en bas ;
 *  - purement présentationnel : aucune logique d'auth, aucune requête ;
 *  - amélioration progressive : sans JavaScript, rien ne s'affiche.
 */

const BUTTON_CLASS =
  "pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-champagne-500/40 bg-cream-50/95 text-choco-700 shadow-[0_12px_30px_-14px_rgba(43,26,18,0.5)] backdrop-blur transition-all hover:bg-champagne-400/20 hover:text-choco-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60";

export function ScrollButtons() {
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  useEffect(() => {
    let frame = 0;

    function update() {
      frame = 0;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;

      /* Page trop courte pour défiler : aucun bouton. */
      if (scrollable < 240) {
        setCanScrollUp(false);
        setCanScrollDown(false);
        return;
      }

      const y = window.scrollY;
      setCanScrollUp(y > 160);
      setCanScrollDown(scrollable - y > 160);
    }

    function onScrollOrResize() {
      if (frame === 0) {
        frame = window.requestAnimationFrame(update);
      }
    }

    update();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, []);

  if (!canScrollUp && !canScrollDown) return null;

  return (
    <div
      aria-label="Défilement de la page"
      className="pointer-events-none fixed bottom-5 right-4 z-40 flex flex-col gap-2 sm:right-6"
    >
      {canScrollUp ? (
        <button
          type="button"
          aria-label="Vers le haut"
          title="Vers le haut"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className={BUTTON_CLASS}
        >
          <ArrowUp size={19} />
        </button>
      ) : null}

      {canScrollDown ? (
        <button
          type="button"
          aria-label="Vers le bas"
          title="Vers le bas"
          onClick={() =>
            window.scrollTo({
              top: document.documentElement.scrollHeight,
              behavior: "smooth",
            })
          }
          className={BUTTON_CLASS}
        >
          <ArrowDown size={19} />
        </button>
      ) : null}
    </div>
  );
}
