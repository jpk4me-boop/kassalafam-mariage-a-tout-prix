"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from "react";
import {
  Ban,
  Link2,
  Loader2,
  RefreshCw,
  Share2,
  ShieldCheck,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { MemberProfileShareLinkItem } from "@/lib/types/database";
import { FormError, Select } from "@/components/ui/field";
import { ShareActions } from "@/components/share/share-actions";
import {
  createMyProfileShareLinkAction,
  getMyProfileShareLinkAction,
  revokeMyProfileShareLinkAction,
  rotateMyProfileShareLinkAction,
  type ProfileShareDuration,
} from "@/app/(member)/profile/share-link-actions";

/** Copie d'affichage du texte officiel v1 (source de vérité : la RPC). */
const CONSENT_TEXT =
  "J’autorise KASSALAFAM à publier et partager une présentation limitée de mon profil à des fins de mise en relation matrimoniale.";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
});

const DURATION_LABELS: Record<ProfileShareDuration, string> = {
  "1d": "24 heures",
  "7d": "7 jours",
  "30d": "30 jours",
};

type ConsentState =
  | { kind: "loading" }
  | { kind: "inactive"; justWithdrawn: boolean }
  | { kind: "active"; consentedAt: string };

type PendingAction = "grant" | "withdraw" | "create" | "rotate" | "revoke" | null;

const noopSubscribe = () => () => {};
function useBrowserOrigin(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : DATE_FMT.format(date);
}

export function ProfileShareConsentCard() {
  const [state, setState] = useState<ConsentState>({ kind: "loading" });
  const [linkLoading, setLinkLoading] = useState(true);
  const [link, setLink] = useState<MemberProfileShareLinkItem | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const origin = useBrowserOrigin();
  const [duration, setDuration] = useState<ProfileShareDuration>("7d");
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createClient();
      const [consentResult, linkResult] = await Promise.all([
        supabase
          .from("profile_share_consents")
          .select("consented_at")
          .is("withdrawn_at", null)
          .maybeSingle(),
        getMyProfileShareLinkAction(),
      ]);

      if (!active) return;

      if (consentResult.error) {
        setState({ kind: "inactive", justWithdrawn: false });
        setError("Impossible de charger votre autorisation. Réessayez.");
      } else {
        setState(
          consentResult.data
            ? { kind: "active", consentedAt: consentResult.data.consented_at }
            : { kind: "inactive", justWithdrawn: false },
        );
      }

      if (!linkResult.ok) {
        setError((current) => current ?? linkResult.error);
      } else {
        setLink(linkResult.data);
      }
      setLinkLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  async function grant() {
    setPending("grant");
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc(
      "grant_my_profile_share_consent",
    );
    setPending(null);
    if (rpcError || !data?.[0]) {
      setError("L’autorisation n’a pas pu être enregistrée. Réessayez.");
      return;
    }
    setState({ kind: "active", consentedAt: data[0].consented_at });
    setNotice("Autorisation enregistrée. Vous pouvez maintenant créer votre lien.");
  }

  async function withdraw() {
    setPending("withdraw");
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc(
      "withdraw_my_profile_share_consent",
    );
    setPending(null);
    if (rpcError) {
      setError("Le retrait n’a pas pu être enregistré. Réessayez.");
      return;
    }
    setState({ kind: "inactive", justWithdrawn: true });
    setLink(null);
    setFreshToken(null);
  }

  async function createLink() {
    setPending("create");
    setError(null);
    setNotice(null);
    const result = await createMyProfileShareLinkAction({ duration });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLink({
      link_id: result.data.link_id,
      token_prefix: result.data.token_prefix,
      created_at: new Date().toISOString(),
      expires_at: result.data.expires_at,
      revoked_at: null,
      status: "active",
    });
    setFreshToken(result.data.token);
    setNotice("Lien créé. Copiez-le ou partagez-le maintenant.");
  }

  async function rotateLink() {
    setPending("rotate");
    setError(null);
    setNotice(null);
    const result = await rotateMyProfileShareLinkAction({ duration });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLink({
      link_id: result.data.link_id,
      token_prefix: result.data.token_prefix,
      created_at: new Date().toISOString(),
      expires_at: result.data.expires_at,
      revoked_at: null,
      status: "active",
    });
    setFreshToken(result.data.token);
    setNotice("Ancien lien révoqué. Le nouveau lien est prêt à être partagé.");
  }

  async function revokeLink() {
    if (!link) return;
    setPending("revoke");
    setError(null);
    setNotice(null);
    const result = await revokeMyProfileShareLinkAction({ linkId: link.link_id });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLink({
      ...link,
      revoked_at: new Date().toISOString(),
      status: "revoked",
    });
    setFreshToken(null);
    setNotice(
      result.data.alreadyRevoked
        ? "Ce lien était déjà révoqué."
        : "Lien révoqué. Il n’est plus accessible.",
    );
  }

  const consentedDate =
    state.kind === "active" ? formatDate(state.consentedAt) : null;
  const shareUrl = freshToken && origin
    ? `${origin}/p/${encodeURIComponent(freshToken)}`
    : "";
  const linkActive = link?.status === "active";

  return (
    <section className="glass rounded-3xl p-6 shadow-card sm:p-8">
      <div className="flex items-center gap-2">
        <Share2 size={18} className="text-choco-600" aria-hidden />
        <h2 className="font-serif text-xl font-semibold text-choco-700">
          Partage public limité du profil
        </h2>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink-700/75">
        Avec votre autorisation, vous pouvez créer un lien temporaire présentant
        uniquement certaines informations de votre profil. Vos coordonnées, votre
        nom complet, vos messages et vos données privées ne sont jamais affichés.
      </p>

      <blockquote className="mt-4 rounded-2xl border border-champagne-500/30 bg-cream-100/40 p-4 text-sm italic leading-relaxed text-ink-800">
        « {CONSENT_TEXT} »
      </blockquote>

      {error ? (
        <div className="mt-4">
          <FormError message={error} />
        </div>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="mt-4 rounded-2xl border border-emerald-600/25 bg-emerald-600/5 p-4 text-sm text-emerald-800"
        >
          {notice}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-3">
        {state.kind === "loading" ? (
          <p className="inline-flex items-center gap-2 text-sm text-ink-700/60">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            Chargement de votre autorisation…
          </p>
        ) : state.kind === "active" ? (
          <>
            <p className="inline-flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-600/10 px-3 py-1 font-medium text-emerald-700">
                <ShieldCheck size={14} aria-hidden />
                Autorisation active
              </span>
              <span className="text-ink-700/60">donnée le {consentedDate}</span>
            </p>

            <button
              type="button"
              onClick={withdraw}
              disabled={pending !== null}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-full border border-champagne-500/40 bg-cream-100/60 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === "withdraw" ? (
                <Loader2 size={16} className="animate-spin" aria-hidden />
              ) : (
                <Ban size={16} aria-hidden />
              )}
              {pending === "withdraw" ? "Retrait…" : "Retirer mon autorisation"}
            </button>
          </>
        ) : (
          <>
            {state.justWithdrawn ? (
              <p
                role="status"
                className="rounded-2xl border border-champagne-500/30 bg-champagne-400/10 p-4 text-sm text-choco-700"
              >
                Votre autorisation a été retirée et tout lien encore ouvert a été
                révoqué. Aucun ancien lien ne pourra redevenir actif si vous
                autorisez à nouveau le partage.
              </p>
            ) : null}
            <button
              type="button"
              onClick={grant}
              disabled={pending !== null}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-6 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {pending === "grant" ? (
                <Loader2 size={16} className="animate-spin" aria-hidden />
              ) : (
                <ShieldCheck size={16} aria-hidden />
              )}
              {pending === "grant"
                ? "Enregistrement…"
                : "Autoriser le partage limité"}
            </button>
          </>
        )}
      </div>

      {state.kind === "active" ? (
        <div className="mt-7 border-t border-champagne-500/20 pt-6">
          <div className="flex items-center gap-2">
            <Link2 size={17} className="text-choco-600" aria-hidden />
            <h3 className="font-serif text-lg font-semibold text-choco-700">
              Mon lien temporaire
            </h3>
          </div>

          {linkLoading ? (
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-ink-700/60">
              <Loader2 size={16} className="animate-spin" aria-hidden />
              Chargement du lien…
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              {link ? (
                <div className="rounded-2xl border border-champagne-500/25 bg-cream-100/40 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        link.status === "active"
                          ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700"
                          : "border-champagne-500/30 bg-cream-100/70 text-ink-700/65"
                      }`}
                    >
                      {link.status === "active"
                        ? "Lien actif"
                        : link.status === "expired"
                          ? "Lien expiré"
                          : "Lien révoqué"}
                    </span>
                    <span className="font-mono text-xs text-ink-700/55">
                      Réf. {link.token_prefix}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-ink-700/50">Créé le</dt>
                      <dd>{formatDate(link.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-700/50">Expire le</dt>
                      <dd>{formatDate(link.expires_at)}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}

              {shareUrl ? (
                <div className="rounded-2xl border border-emerald-600/25 bg-emerald-600/5 p-4">
                  <p className="text-sm font-medium text-emerald-800">
                    Cette adresse complète est affichée uniquement maintenant.
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-800/75">
                    KASSALAFAM ne conserve que son empreinte de sécurité. Copiez ou
                    partagez le lien avant de quitter cette page.
                  </p>
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    aria-label="Lien public temporaire de mon profil"
                    className="mt-3 w-full rounded-xl border border-emerald-600/20 bg-white/70 px-3 py-2 font-mono text-xs text-ink-800"
                  />
                  <ShareActions
                    url={shareUrl}
                    title="Profil matrimonial partagé sur KASSALAFAM"
                    text="Découvrez cette présentation limitée et vérifiée sur KASSALAFAM — Mariage à Tout Prix."
                    variant="panel"
                    className="mt-4"
                  />
                </div>
              ) : linkActive ? (
                <p className="rounded-2xl border border-champagne-500/25 bg-cream-100/40 p-4 text-sm leading-relaxed text-ink-700/70">
                  Le lien est actif, mais son adresse complète n’est jamais stockée.
                  Pour l’obtenir de nouveau, remplacez ce lien : l’ancien sera
                  révoqué avant la création du nouveau.
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div>
                  <label
                    htmlFor="profile-share-duration"
                    className="mb-1.5 block text-sm font-medium text-ink-800"
                  >
                    Durée du prochain lien
                  </label>
                  <Select
                    id="profile-share-duration"
                    value={duration}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setDuration(event.target.value as ProfileShareDuration)
                    }
                    disabled={pending !== null}
                  >
                    {(Object.keys(DURATION_LABELS) as ProfileShareDuration[]).map(
                      (value) => (
                        <option key={value} value={value}>
                          {DURATION_LABELS[value]}
                        </option>
                      ),
                    )}
                  </Select>
                </div>

                {!linkActive ? (
                  <button
                    type="button"
                    onClick={createLink}
                    disabled={pending !== null}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-6 py-2.5 text-sm font-semibold text-cream-50 ring-1 ring-inset ring-champagne-400/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending === "create" ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                    ) : (
                      <Link2 size={16} aria-hidden />
                    )}
                    {pending === "create" ? "Création…" : "Créer mon lien"}
                  </button>
                ) : null}
              </div>

              {linkActive ? (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={rotateLink}
                    disabled={pending !== null}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 ring-1 ring-inset ring-champagne-400/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending === "rotate" ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                    ) : (
                      <RefreshCw size={16} aria-hidden />
                    )}
                    {pending === "rotate" ? "Remplacement…" : "Remplacer le lien"}
                  </button>
                  <button
                    type="button"
                    onClick={revokeLink}
                    disabled={pending !== null}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-red-500/30 bg-red-500/5 px-5 py-2.5 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending === "revoke" ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                    ) : (
                      <Ban size={16} aria-hidden />
                    )}
                    {pending === "revoke" ? "Révocation…" : "Révoquer le lien"}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
