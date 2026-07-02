"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  CircleAlert,
  Loader2,
  Lock,
  Send,
  UserRound,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { MessageRow, RelationshipItemWithPhoto } from "@/lib/types/database";

/**
 * L3E-PR2 — Vue « Conversation » (Client Component).
 *
 * Affiche le fil d'un match ACCEPTÉ et permet d'envoyer des messages.
 * Toutes les écritures/lectures passent par les RPC sécurisées de L3E-PR1
 * (`send_message`, `get_conversation_messages`, `mark_conversation_read`) —
 * aucune écriture directe de table. La page serveur a déjà vérifié que le
 * viewer est authentifié, approuvé, et participant de ce match accepté.
 *
 * Confidentialité photo : même règle que la découverte / les relations —
 * l'avatar n'affiche l'image que si `signedUrl` est présent ; sinon placeholder.
 */

const MAX_LEN = 4000;

function Avatar({ other }: { other: RelationshipItemWithPhoto }) {
  return (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-champagne-500/30 bg-cream-100/60">
      {other.signedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={other.signedUrl}
          alt={`Photo de ${other.first_name ?? "ce membre"}`}
          className="h-full w-full object-cover"
        />
      ) : other.is_blurred ? (
        <Lock size={18} className="text-ink-700/45" />
      ) : (
        <UserRound size={20} className="text-ink-700/35" />
      )}
    </span>
  );
}

export function ConversationView({
  matchId,
  currentUserId,
  other,
  initialMessages,
}: {
  matchId: string;
  currentUserId: string;
  other: RelationshipItemWithPhoto;
  initialMessages: MessageRow[];
}) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  // À l'ouverture : marque comme lus les messages reçus (fire-and-forget).
  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("mark_conversation_read", { p_match: matchId }).then(
      () => {},
      () => {},
    );
  }, [matchId]);

  // Autoscroll vers le dernier message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const send = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const content = draft.trim();
      if (!content || sending) return;

      setSending(true);
      setError(null);

      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("send_message", {
        p_match: matchId,
        p_content: content,
      });

      setSending(false);

      if (rpcError || !data) {
        console.error("[conversation] send_message échoué:", rpcError?.message);
        setError("Impossible d’envoyer le message pour le moment.");
        return;
      }

      setMessages((prev) => [...prev, data as MessageRow]);
      setDraft("");
    },
    [draft, sending, matchId],
  );

  const otherName = other.first_name ?? "Membre";

  return (
    <div className="flex flex-col gap-4">
      {/* En-tête : retour + identité de l'autre membre */}
      <header className="flex items-center gap-3">
        <Link
          href="/matches"
          aria-label="Retour à mes relations"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-champagne-500/40 bg-cream-50/60 text-choco-700 transition-colors hover:bg-champagne-400/15"
        >
          <ArrowLeft size={16} />
        </Link>

        <Avatar other={other} />

        <div className="min-w-0">
          <h1 className="flex items-center gap-1.5 truncate font-serif text-lg font-semibold text-choco-700">
            {otherName}
            {typeof other.age === "number" ? (
              <span className="font-sans text-sm font-normal text-ink-700/60">
                · {other.age}
              </span>
            ) : null}
          </h1>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <BadgeCheck size={12} />
            Profil vérifié · Intérêt mutuel
          </span>
        </div>
      </header>

      {/* Fil de messages */}
      <section
        aria-label={`Conversation avec ${otherName}`}
        className="flex min-h-[50vh] flex-col gap-3 rounded-3xl border border-champagne-500/30 bg-cream-50/50 p-4 shadow-card sm:p-5"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
              <Send size={18} />
            </span>
            <p className="font-serif text-lg font-semibold text-choco-700">
              Démarrez la conversation
            </p>
            <p className="max-w-sm text-sm text-ink-700/70">
              Vous avez un intérêt mutuel avec {otherName}. Écrivez un premier
              message sincère et respectueux.
            </p>
          </div>
        ) : (
          <ul className="flex flex-1 flex-col gap-2.5">
            {messages.map((m) => {
              const mine = m.sender_id === currentUserId;
              return (
                <li
                  key={m.id}
                  className={mine ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={
                      mine
                        ? "max-w-[80%] rounded-2xl rounded-br-md bg-gradient-to-br from-choco-600 to-choco-800 px-3.5 py-2 text-sm text-cream-50 shadow-[0_10px_24px_-16px_rgba(43,26,18,0.8)]"
                        : "max-w-[80%] rounded-2xl rounded-bl-md border border-champagne-500/30 bg-cream-100/70 px-3.5 py-2 text-sm text-ink-800"
                    }
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <time
                      dateTime={m.created_at}
                      suppressHydrationWarning
                      className={
                        mine
                          ? "mt-1 block text-right text-[10px] text-cream-50/60"
                          : "mt-1 block text-right text-[10px] text-ink-700/45"
                      }
                    >
                      {new Date(m.created_at).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                </li>
              );
            })}
            <div ref={bottomRef} />
          </ul>
        )}
      </section>

      {/* Composer */}
      <form onSubmit={send} className="flex flex-col gap-2">
        {error ? (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-sm font-medium text-red-700"
          >
            <CircleAlert size={14} />
            {error}
          </p>
        ) : null}

        <div className="flex items-end gap-2">
          <label htmlFor="message-input" className="sr-only">
            Votre message
          </label>
          <input
            id="message-input"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_LEN}
            autoComplete="off"
            placeholder={`Écrire à ${otherName}…`}
            className="flex-1 rounded-full border border-champagne-500/40 bg-cream-50/80 px-4 py-2.5 text-sm text-ink-800 outline-none transition-colors placeholder:text-ink-700/40 focus:border-choco-500/50 focus:bg-cream-50"
          />
          <button
            type="submit"
            disabled={sending || draft.trim().length === 0}
            aria-busy={sending}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {sending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            <span className="hidden sm:inline">Envoyer</span>
          </button>
        </div>
      </form>
    </div>
  );
}
