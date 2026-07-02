"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  CircleAlert,
  Flag,
  Loader2,
  Lock,
  MoreVertical,
  Send,
  Shield,
  ShieldCheck,
  ShieldOff,
  UserRound,
  X,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type {
  MessageRow,
  RelationshipItem,
  RelationshipItemWithPhoto,
  SafetyReportReason,
} from "@/lib/types/database";

/**
 * L3E-PR2 / L3F-B — Vue « Conversation » (Client Component).
 *
 * Affiche le fil d'un match ACCEPTÉ, permet d'envoyer des messages, et ajoute
 * l'interface de SÉCURITÉ (L3F-B) : bloquer / débloquer l'autre participant,
 * signaler un message reçu, et un état NEUTRE de messagerie indisponible.
 *
 * Toutes les écritures/lectures passent par les RPC sécurisées :
 *   - envoi          : `send_message`               (garde `can_send_message`) ;
 *   - lecture fil    : `get_conversation_messages`   (garde `can_message`) ;
 *   - lu             : `mark_conversation_read` ;
 *   - blocage        : `block_match_participant`     (matchId seul) ;
 *   - déblocage      : `unblock_profile`             (autre profileId) ;
 *   - signalement    : `report_message`              (message + motif + détails) ;
 *   - relation       : `list_my_relationships`       (rafraîchit blocked_by_me /
 *                      messaging_available).
 *
 * Le BACKEND reste l'autorité : aucun identifiant sensible n'est envoyé depuis
 * le DOM (blocker_id, reporter_id, reported_user_id, match_id d'un message,
 * sender_id sont TOUS déduits côté serveur). L'origine d'un blocage créé par
 * l'autre membre n'est JAMAIS révélée (état neutre via `messaging_available`).
 */

const MAX_LEN = 4000;
const MAX_DETAILS = 1000;

/** Motifs techniques STRICTS (= CHECK `safety_reports.reason`) + libellés FR. */
const REPORT_REASONS: { value: SafetyReportReason; label: string }[] = [
  { value: "harassment", label: "Harcèlement ou comportement insistant" },
  { value: "sexual_content", label: "Contenu sexuel inapproprié" },
  { value: "scam", label: "Arnaque ou demande d’argent" },
  { value: "hate", label: "Discours haineux" },
  { value: "threat", label: "Menace ou intimidation" },
  { value: "impersonation", label: "Usurpation d’identité" },
  { value: "spam", label: "Spam ou publicité" },
  { value: "other", label: "Autre motif" },
];

type Toast = { id: number; tone: "success" | "error"; message: string };
type Relation = { blocked_by_me: boolean; messaging_available: boolean };

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

// --- Coquille de modale (overlay + carte, Escape + focus + clic extérieur) ---

function ModalShell({
  titleId,
  onClose,
  children,
}: {
  titleId: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Conserve la dernière version de `onClose` sans re-déclencher les effets
  // ci-dessous (évite le vol de focus lors d'un rerender du parent).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Focus initial : UNE seule fois au montage. Un rerender du parent ne le
  // replace pas (dépendances stables). `cardRef` est une ref, pas une dépendance.
  useEffect(() => {
    cardRef.current
      ?.querySelector<HTMLElement>(
        "button, select, textarea, input, [href]",
      )
      ?.focus();
  }, []);

  // Listener Escape stable (monté une fois) qui lit TOUJOURS la version courante
  // de `onClose` via la ref synchronisée. Nettoyé au démontage.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
        aria-hidden="true"
        onMouseDown={onClose}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-3xl border border-champagne-500/40 bg-cream-50 p-5 shadow-[0_30px_80px_-30px_rgba(43,26,18,0.6)]"
      >
        {children}
      </div>
    </div>
  );
}

// --- Menu de sécurité (popover dans l'en-tête) ------------------------------

function SecurityMenu({
  relation,
  busy,
  onBlock,
  onUnblock,
}: {
  relation: Relation;
  busy: boolean;
  onBlock: () => void;
  onUnblock: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const canBlock = relation.messaging_available && !relation.blocked_by_me;
  const canUnblock = relation.blocked_by_me;

  // Aucune action possible (ex. blocage créé par l'autre membre) : pas de menu.
  if (!canBlock && !canUnblock) return null;

  return (
    <div ref={wrapRef} className="relative ml-auto shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Options de sécurité"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-champagne-500/40 bg-cream-50/60 text-choco-700 transition-colors hover:bg-champagne-400/15"
      >
        <MoreVertical size={16} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Options de sécurité"
          className="absolute right-0 top-11 z-10 w-60 overflow-hidden rounded-2xl border border-champagne-500/40 bg-cream-50 shadow-[0_24px_60px_-24px_rgba(43,26,18,0.55)]"
        >
          {canBlock ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onBlock();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Ban size={16} className="shrink-0" />
              Bloquer ce profil
            </button>
          ) : null}

          {canUnblock ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onUnblock();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ShieldCheck size={16} className="shrink-0" />
              Débloquer ce profil
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// --- Confirmation de blocage (danger uniquement dans la confirmation) -------

function BlockConfirmDialog({
  busy,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalShell titleId="block-title" onClose={busy ? () => {} : onCancel}>
      <div className="flex flex-col gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-700">
          <Ban size={20} />
        </span>
        <h2
          id="block-title"
          className="font-serif text-lg font-semibold text-choco-800"
        >
          Bloquer ce profil ?
        </h2>
        <p className="text-sm text-ink-700/75">
          Vous ne pourrez plus échanger de nouveaux messages avec cette personne.
          L’historique de la conversation restera visible.
        </p>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center rounded-full border border-champagne-500/40 bg-cream-50/60 px-4 py-2.5 text-sm font-medium text-ink-700/75 transition-colors hover:bg-champagne-400/15 hover:text-choco-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-red-700 px-4 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(153,27,27,0.8)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
            Bloquer
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// --- Dialogue de signalement d'un message -----------------------------------

function ReportDialog({
  onSubmit,
  onClose,
}: {
  onSubmit: (reason: SafetyReportReason, details: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<SafetyReportReason | "">("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detailsLen = details.length;

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting || reason === "") return;
      setSubmitting(true);
      setError(null);
      const ok = await onSubmit(reason, details);
      if (!ok) {
        setSubmitting(false);
        setError("Impossible d’envoyer le signalement pour le moment.");
        return;
      }
      // Succès : la fermeture / le toast sont gérés par le parent.
      onClose();
    },
    [submitting, reason, details, onSubmit, onClose],
  );

  return (
    <ModalShell titleId="report-title" onClose={submitting ? () => {} : onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2
            id="report-title"
            className="font-serif text-lg font-semibold text-choco-800"
          >
            Signaler ce message
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Fermer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-700/50 transition-colors hover:bg-champagne-400/15 hover:text-choco-700 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="report-reason"
            className="text-sm font-medium text-choco-700"
          >
            Motif <span className="text-red-600">*</span>
          </label>
          <select
            id="report-reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value as SafetyReportReason)}
            className="w-full rounded-2xl border border-champagne-500/40 bg-cream-50/80 px-3.5 py-2.5 text-sm text-ink-800 outline-none transition-colors focus:border-choco-500/50 focus:bg-cream-50"
          >
            <option value="" disabled>
              Sélectionnez un motif…
            </option>
            {REPORT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="report-details"
            className="text-sm font-medium text-choco-700"
          >
            Détails (facultatif)
          </label>
          <textarea
            id="report-details"
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, MAX_DETAILS))}
            maxLength={MAX_DETAILS}
            rows={3}
            placeholder="Ajoutez un contexte utile à la vérification…"
            className="w-full resize-none rounded-2xl border border-champagne-500/40 bg-cream-50/80 px-3.5 py-2.5 text-sm text-ink-800 outline-none transition-colors placeholder:text-ink-700/40 focus:border-choco-500/50 focus:bg-cream-50"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-700/55">
              Le message signalé sera conservé avec votre signalement afin de
              permettre sa vérification.
            </p>
            <span
              className="shrink-0 pl-2 text-xs tabular-nums text-ink-700/50"
              aria-live="polite"
            >
              {detailsLen}/{MAX_DETAILS}
            </span>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-sm font-medium text-red-700"
          >
            <CircleAlert size={14} />
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex flex-1 items-center justify-center rounded-full border border-champagne-500/40 bg-cream-50/60 px-4 py-2.5 text-sm font-medium text-ink-700/75 transition-colors hover:bg-champagne-400/15 hover:text-choco-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting || reason === ""}
            aria-busy={submitting}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-4 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {submitting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Flag size={15} />
            )}
            Signaler
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// --- Vue principale ---------------------------------------------------------

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

  const [relation, setRelation] = useState<Relation>({
    blocked_by_me: other.blocked_by_me,
    messaging_available: other.messaging_available,
  });
  const [actionPending, setActionPending] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<MessageRow | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((tone: Toast["tone"], message: string) => {
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, tone, message }));
  }, []);

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

  // Re-synchronise blocked_by_me / messaging_available depuis le backend (autorité).
  const refreshRelation = useCallback(async (): Promise<Relation | null> => {
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc(
      "list_my_relationships",
    );
    if (rpcError || !data) return null;
    const row = (data as RelationshipItem[]).find(
      (r) => r.match_id === matchId,
    );
    if (!row) return null;
    const next: Relation = {
      blocked_by_me: row.blocked_by_me,
      messaging_available: row.messaging_available,
    };
    setRelation(next);
    return next;
  }, [matchId]);

  const send = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const content = draft.trim();
      // Garde côté UI : jamais d'appel send_message si messagerie indisponible.
      if (!content || sending || !relation.messaging_available) return;

      setSending(true);
      setError(null);

      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("send_message", {
        p_match: matchId,
        p_content: content,
      });

      if (rpcError || !data) {
        // Le backend est l'autorité : re-synchronise la relation. Si la
        // messagerie est devenue indisponible (ex. blocage), on bascule en état
        // neutre sans exposer d'erreur SQL brute ni l'origine du blocage.
        const fresh = await refreshRelation();
        setSending(false);
        if (fresh && !fresh.messaging_available) return;
        console.error("[conversation] send_message échoué:", rpcError?.message);
        setError("La messagerie n’est actuellement pas disponible pour cette relation.");
        return;
      }

      setSending(false);
      setMessages((prev) => [...prev, data as MessageRow]);
      setDraft("");
    },
    [draft, sending, relation.messaging_available, matchId, refreshRelation],
  );

  const doBlock = useCallback(async () => {
    if (actionPending) return;
    setActionPending(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("block_match_participant", {
      p_match: matchId,
    });
    if (rpcError) {
      // Échec RPC : l'état relationnel reste INCHANGÉ (pas de blocage optimiste).
      console.error("[conversation] block échoué:", rpcError.message);
      setActionPending(false);
      setBlockOpen(false);
      showToast(
        "error",
        "Impossible de modifier les paramètres de cette relation pour le moment.",
      );
      return;
    }
    // Succès backend CONFIRMÉ : bascule immédiate vers un état local SÛR (le
    // composer disparaît aussitôt, aucun brouillon ne peut plus partir). Les
    // autres propriétés éventuelles de la relation sont conservées.
    setRelation((prev) => ({
      ...prev,
      blocked_by_me: true,
      messaging_available: false,
    }));
    // Réconciliation avec le backend. Si le refresh échoue (réseau), l'état sûr
    // ci-dessus persiste : la messagerie n'est jamais réactivée arbitrairement.
    await refreshRelation();
    setActionPending(false);
    setBlockOpen(false);
    showToast("success", "Profil bloqué. L’historique reste visible.");
  }, [actionPending, matchId, refreshRelation, showToast]);

  const doUnblock = useCallback(async () => {
    if (actionPending) return;
    setActionPending(true);
    const supabase = createClient();
    // Seul l'identifiant de l'autre membre (issu de la relation) est transmis.
    const { error: rpcError } = await supabase.rpc("unblock_profile", {
      p_target: other.other_id,
    });
    if (rpcError) {
      console.error("[conversation] unblock échoué:", rpcError.message);
      setActionPending(false);
      showToast(
        "error",
        "Impossible de modifier les paramètres de cette relation pour le moment.",
      );
      return;
    }
    // La messagerie ne redevient disponible que si aucun autre blocage n'existe.
    // Si l'autre membre maintient le sien, on reste NEUTRE (pas de révélation).
    await refreshRelation();
    setActionPending(false);
    showToast("success", "Profil débloqué.");
  }, [actionPending, other.other_id, refreshRelation, showToast]);

  const submitReport = useCallback(
    async (reason: SafetyReportReason, details: string): Promise<boolean> => {
      if (!reportTarget) return false;
      const trimmed = details.trim();
      const supabase = createClient();
      // Le client ne transmet QUE message + motif + détails : reporter_id,
      // reported_user_id, match_id et sender_id sont déduits côté serveur.
      const { error: rpcError } = await supabase.rpc("report_message", {
        p_message: reportTarget.id,
        p_reason: reason,
        p_details: trimmed.length > 0 ? trimmed : null,
      });
      if (rpcError) {
        console.error("[conversation] report échoué:", rpcError.message);
        return false;
      }
      // Idempotent côté backend : même succès si le message était déjà signalé.
      // Le message signalé reste visible dans le fil (jamais masqué/supprimé).
      showToast(
        "success",
        "Le message a été signalé. Notre équipe pourra l’examiner.",
      );
      return true;
    },
    [reportTarget, showToast],
  );

  const otherName = other.first_name ?? "Membre";

  return (
    <div className="flex flex-col gap-4">
      {/* En-tête : retour + identité + menu de sécurité */}
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

        <SecurityMenu
          relation={relation}
          busy={actionPending}
          onBlock={() => setBlockOpen(true)}
          onUnblock={doUnblock}
        />
      </header>

      {/* Fil de messages (toujours visible, même après blocage) */}
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
                  className={mine ? "flex flex-col items-end" : "flex flex-col items-start"}
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

                  {/* Signalement : messages REÇUS uniquement (jamais les miens). */}
                  {!mine ? (
                    <button
                      type="button"
                      onClick={() => setReportTarget(m)}
                      className="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-ink-700/45 transition-colors hover:text-red-700"
                    >
                      <Flag size={11} />
                      Signaler ce message
                    </button>
                  ) : null}
                </li>
              );
            })}
            <div ref={bottomRef} />
          </ul>
        )}
      </section>

      {/* Zone d'envoi : composer actif OU panneau neutre si indisponible */}
      {relation.messaging_available ? (
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
      ) : (
        <div
          role="status"
          className="flex flex-col items-center gap-2 rounded-3xl border border-champagne-500/40 bg-cream-100/40 p-5 text-center"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
            <ShieldOff size={18} />
          </span>
          <p className="text-sm font-medium text-choco-700">
            La messagerie n’est actuellement pas disponible pour cette relation.
          </p>
          <p className="max-w-sm text-sm text-ink-700/65">
            Vous pouvez toujours consulter l’historique de vos échanges.
          </p>
          {relation.blocked_by_me ? (
            <button
              type="button"
              onClick={doUnblock}
              disabled={actionPending}
              aria-busy={actionPending}
              className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-champagne-500/50 bg-cream-50/70 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <ShieldCheck size={15} />
              )}
              Débloquer le profil
            </button>
          ) : null}
        </div>
      )}

      {/* Dialogues */}
      {blockOpen ? (
        <BlockConfirmDialog
          busy={actionPending}
          onConfirm={doBlock}
          onCancel={() => setBlockOpen(false)}
        />
      ) : null}

      {reportTarget ? (
        <ReportDialog
          onSubmit={submitReport}
          onClose={() => {
            setReportTarget(null);
          }}
        />
      ) : null}

      {/* Toast */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4"
        >
          <div
            className={
              toast.tone === "success"
                ? "pointer-events-auto flex items-center gap-2 rounded-full border border-emerald-600/30 bg-emerald-700 px-4 py-2.5 text-sm font-medium text-cream-50 shadow-lg"
                : "pointer-events-auto flex items-center gap-2 rounded-full border border-red-600/30 bg-red-700 px-4 py-2.5 text-sm font-medium text-cream-50 shadow-lg"
            }
          >
            {toast.tone === "success" ? (
              <Shield size={15} />
            ) : (
              <CircleAlert size={15} />
            )}
            {toast.message}
          </div>
        </div>
      ) : null}
    </div>
  );
}
