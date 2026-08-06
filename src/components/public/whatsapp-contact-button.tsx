"use client";

import { MessageCircle } from "lucide-react";

import {
  buildWhatsappContactUrl,
  type WhatsappContactContext,
} from "@/lib/contact/whatsapp-contact";
import { cn } from "@/lib/utils";

/**
 * Bouton de contact WhatsApp pour les VISITEURS des pages publiques.
 *
 * - Placé en bas à GAUCHE : `ScrollButtons` occupe déjà le bas à droite
 *   (`fixed bottom-5 right-4 z-40`), une collision serait garantie sur mobile.
 * - `z-30` : sous les boutons de défilement, au-dessus du contenu.
 * - Rendu UNIQUEMENT si `NEXT_PUBLIC_WHATSAPP_CONTACT` contient un numéro
 *   exploitable. Variable absente ⇒ `null`, aucune trace dans le DOM.
 *
 * Réservé aux pages publiques : les espaces membre et admin ont déjà leurs
 * propres points de contact.
 */
export function WhatsappContactButton({
  context = "accueil",
  className,
}: {
  context?: WhatsappContactContext;
  className?: string;
}) {
  const href = buildWhatsappContactUrl(
    process.env.NEXT_PUBLIC_WHATSAPP_CONTACT,
    context,
  );

  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Nous écrire sur WhatsApp"
      className={cn(
        "fixed bottom-5 left-4 z-30 flex items-center gap-2 rounded-full border border-champagne-400/50",
        "bg-gradient-to-br from-choco-600 to-choco-800 px-4 py-3 text-sm font-semibold text-cream-50",
        "shadow-[0_16px_40px_-18px_rgba(43,26,18,0.85)]",
        "transition-transform hover:-translate-y-0.5 hover:border-champagne-300/70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60",
        "sm:left-6",
        className,
      )}
    >
      <MessageCircle size={18} className="shrink-0" aria-hidden="true" />
      <span>WhatsApp</span>
    </a>
  );
}
