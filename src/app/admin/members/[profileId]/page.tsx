import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Flag,
  Heart,
  BadgeCheck,
  MessageSquare,
  Mail,
  MapPin,
  CalendarClock,
  ScrollText,
  ShieldAlert,
  UserRound,
} from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin-guard";
import type {
  ProfileRow,
  MatchRow,
  SafetyReportRow,
  AccountModerationActionRow,
  AdminAuditLogRow,
} from "@/lib/types/database";
import { isUuid } from "@/lib/admin/safety-reports";
import { ageFromBirthDate } from "@/lib/admin/analytics";
import { hasEssentialProfileInfo } from "@/lib/profile";
import {
  SAFETY_REASON_LABELS,
  SAFETY_STATUS_LABELS,
} from "@/lib/admin/safety-reports";
import {
  verificationEventsFrom,
  accountEventsFrom,
  mergeAuditEvents,
} from "@/lib/admin/audit";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { ACCOUNT_STATUS_BADGE } from "@/lib/admin/account-moderation";
import { ProfileActions } from "@/components/admin/profile-actions";
import { MemberAccountActions } from "@/components/admin/member-account-actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fiche membre — Administration",
};

const BUCKET = "profile-photos";
const SIGNED_URL_TTL = 300;

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const DAY_FMT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}
function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DAY_FMT.format(d);
}

const GENDER_LABELS: Record<string, string> = { homme: "Homme", femme: "Femme" };
const MARITAL_LABELS: Record<string, string> = {
  celibataire: "Célibataire",
  divorce: "Divorcé(e)",
  veuf: "Veuf/Veuve",
  separe: "Séparé(e)",
};
const UNIVERSE_LABELS: Record<string, string> = {
  christian_marriage: "Univers chrétien",
  islamic_marriage: "Univers musulman",
  open_marriage: "Ouvert à tous",
};

function Section({
  title,
  Icon,
  children,
  aside,
}: {
  title: string;
  Icon: typeof Camera;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-champagne-500/25 bg-cream-50/60 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 font-serif text-lg font-semibold text-choco-700">
          <Icon size={17} className="text-champagne-600" aria-hidden />
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-ink-700/45">
        {label}
      </dt>
      <dd className="text-sm text-ink-800">{value ?? "—"}</dd>
    </div>
  );
}

function StatCard({
  Icon,
  value,
  label,
  alert,
}: {
  Icon: typeof Camera;
  value: number;
  label: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-4 text-center ${
        alert && value > 0
          ? "border-red-500/25 bg-red-500/5"
          : "border-champagne-500/25 bg-cream-100/40"
      }`}
    >
      <Icon
        size={18}
        className={alert && value > 0 ? "text-red-600" : "text-champagne-600"}
        aria-hidden
      />
      <span className="text-xl font-semibold text-choco-700">{value}</span>
      <span className="text-[11px] text-ink-700/55">{label}</span>
    </div>
  );
}

export default async function AdminMemberDetailPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  await requireAdmin(`/admin/members/${profileId}`);

  if (!isUuid(profileId)) notFound();

  const admin = createAdminClient();

  const { data: profileData, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();

  if (profileError) {
    // Erreur d'infrastructure : on remonte une 404 neutre plutôt qu'un détail.
    notFound();
  }
  if (!profileData) notFound();
  const profile = profileData as ProfileRow;

  // Email best-effort (auth.users, relation 1:1). Jamais exposé au navigateur
  // au-delà de l'affichage admin serveur.
  let email: string | null = null;
  try {
    const { data: userRes } = await admin.auth.admin.getUserById(profileId);
    email = userRes?.user?.email ?? null;
  } catch {
    email = null;
  }

  // Photos (signées côté serveur ; storage_path jamais exposé).
  const { data: photoRows } = await admin
    .from("photos")
    .select("id, storage_path, is_primary, created_at")
    .eq("profile_id", profileId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  const photos: { id: string; url: string | null; isPrimary: boolean }[] = [];
  if (photoRows && photoRows.length > 0) {
    const paths = photoRows.map((p) => p.storage_path);
    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL);
    const urlByPath = new Map<string, string>();
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }
    for (const p of photoRows) {
      photos.push({
        id: p.id,
        url: urlByPath.get(p.storage_path) ?? null,
        isPrimary: p.is_primary,
      });
    }
  }

  // Relations (intérêts + matchs) — tous les rows du membre (bornés).
  const { data: matchData } = await admin
    .from("matches")
    .select("id, user_a, user_b, status, created_at, updated_at")
    .or(`user_a.eq.${profileId},user_b.eq.${profileId}`)
    .order("created_at", { ascending: false });
  const matches = (matchData ?? []) as MatchRow[];

  const otherIds = Array.from(
    new Set(matches.map((m) => (m.user_a === profileId ? m.user_b : m.user_a))),
  );
  const nameById = new Map<string, string | null>();
  if (otherIds.length > 0) {
    const { data: others } = await admin
      .from("profiles")
      .select("id, first_name")
      .in("id", otherIds);
    for (const o of others ?? []) nameById.set(o.id, o.first_name);
  }

  const interestsSent = matches.filter((m) => m.user_a === profileId).length;
  const interestsReceived = matches.filter(
    (m) => m.user_b === profileId,
  ).length;
  const matchesCount = matches.filter((m) => m.status === "accepted").length;

  // Nombre de messages ENVOYÉS (jamais le contenu). Compteur seul.
  const { count: messagesSent } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", profileId);

  // Signalements REÇUS (métadonnées uniquement ; pas de snapshot privé ici).
  const { data: reportData } = await admin
    .from("safety_reports")
    .select("id, reason, status, details, created_at")
    .eq("reported_user_id", profileId)
    .order("created_at", { ascending: false });
  const reports = (reportData ?? []) as Pick<
    SafetyReportRow,
    "id" | "reason" | "status" | "details" | "created_at"
  >[];

  // Historique de modération de CE membre : suspensions + décisions de
  // vérification (fusion des deux journaux member-scoped).
  const { data: accountActions } = await admin
    .from("account_moderation_actions")
    .select(
      "id, profile_id, profile_id_snapshot, actor_id, actor_email_snapshot, report_id, previous_status, new_status, reason, created_at",
    )
    .eq("profile_id_snapshot", profileId)
    .order("created_at", { ascending: false });

  const { data: verifActions } = await admin
    .from("admin_audit_log")
    .select(
      "id, action_type, actor_id, actor_email_snapshot, target_profile_id, target_profile_id_snapshot, previous_status, new_status, reason, created_at",
    )
    .eq("target_profile_id_snapshot", profileId)
    .order("created_at", { ascending: false });

  const history = mergeAuditEvents(
    accountEventsFrom((accountActions ?? []) as AccountModerationActionRow[]),
    verificationEventsFrom((verifActions ?? []) as AdminAuditLogRow[]),
  );

  const now = new Date();
  const age = ageFromBirthDate(profile.birth_date, now);
  const complete = hasEssentialProfileInfo(profile);
  const accountBadge = ACCOUNT_STATUS_BADGE[profile.account_status];
  const primary = photos.find((p) => p.isPrimary) ?? photos[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/members"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700/70 transition-colors hover:text-choco-700"
        >
          <ArrowLeft size={15} />
          Retour aux membres
        </Link>
      </div>

      {/* En-tête identité */}
      <header className="flex flex-col gap-4 rounded-2xl border border-champagne-500/25 bg-cream-50/60 p-5 sm:flex-row sm:items-center">
        {primary?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primary.url}
            alt=""
            className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-champagne-500/30"
          />
        ) : (
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-choco-600/10 text-choco-600 ring-1 ring-champagne-500/25">
            <UserRound size={30} aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-2xl font-semibold text-choco-700 sm:text-3xl">
            {profile.first_name?.trim() || "Sans prénom"}
            {age !== null ? (
              <span className="ml-2 text-lg font-normal text-ink-700/55">
                {age} ans
              </span>
            ) : null}
          </h1>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-ink-700/70">
            <MapPin size={14} aria-hidden />
            {profile.city?.trim() || "Ville inconnue"}
            {profile.country?.trim() ? `, ${profile.country}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${accountBadge.className}`}
            >
              <accountBadge.Icon size={13} />
              {accountBadge.label}
            </span>
            <AdminStatusBadge status={profile.verification_status} />
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                complete
                  ? "border-emerald-600/25 bg-emerald-600/5 text-emerald-700"
                  : "border-champagne-500/30 bg-champagne-400/10 text-ink-700/60"
              }`}
            >
              {complete ? "Profil complet" : "Profil incomplet"}
            </span>
          </div>
        </div>
      </header>

      {/* Statistiques d'engagement */}
      <Section title="Engagement" Icon={Heart}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard Icon={Camera} value={photos.length} label="Photos" />
          <StatCard Icon={Heart} value={interestsSent} label="Intérêts envoyés" />
          <StatCard
            Icon={Heart}
            value={interestsReceived}
            label="Intérêts reçus"
          />
          <StatCard Icon={BadgeCheck} value={matchesCount} label="Matchs" />
          <StatCard
            Icon={MessageSquare}
            value={messagesSent ?? 0}
            label="Messages envoyés"
          />
          <StatCard
            Icon={Flag}
            value={reports.length}
            label="Signalements"
            alert
          />
        </div>
        <p className="mt-3 text-[11px] text-ink-700/45">
          Compteurs agrégés. Le contenu privé des conversations n’est jamais
          affiché.
        </p>
      </Section>

      {/* Informations du profil */}
      <Section title="Profil" Icon={UserRound}>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Identifiant" value={<code className="text-xs">{profile.id}</code>} />
          <Field
            label="Email"
            value={
              email ? (
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={13} className="text-ink-700/40" />
                  {email}
                </span>
              ) : (
                "—"
              )
            }
          />
          <Field
            label="Genre"
            value={profile.gender ? GENDER_LABELS[profile.gender] : "—"}
          />
          <Field
            label="Statut marital"
            value={
              profile.marital_status
                ? MARITAL_LABELS[profile.marital_status]
                : "—"
            }
          />
          <Field label="Intention" value={profile.intention || "—"} />
          <Field
            label="Univers de découverte"
            value={
              profile.discovery_universe
                ? UNIVERSE_LABELS[profile.discovery_universe]
                : "Non défini"
            }
          />
          <Field label="Premium" value={profile.is_premium ? "Oui" : "Non"} />
          <Field
            label="Photos floutées"
            value={profile.blur_photos ? "Oui" : "Non"}
          />
        </dl>

        {profile.bio?.trim() ? (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wide text-ink-700/45">
              Présentation
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-800">
              {profile.bio}
            </p>
          </div>
        ) : null}
        {profile.partner_expectations?.trim() ? (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wide text-ink-700/45">
              Attentes vis-à-vis du partenaire
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-800">
              {profile.partner_expectations}
            </p>
          </div>
        ) : null}
      </Section>

      {/* Photos */}
      <Section title="Photos" Icon={Camera}>
        {photos.length === 0 ? (
          <p className="text-sm text-ink-700/55">Aucune photo.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {photos.map((p) => (
              <div
                key={p.id}
                className="relative aspect-square overflow-hidden rounded-xl bg-champagne-400/10 ring-1 ring-champagne-500/20"
              >
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[11px] text-ink-700/40">
                    Indisponible
                  </span>
                )}
                {p.isPrimary ? (
                  <span className="absolute left-1 top-1 rounded-full bg-choco-700/80 px-1.5 py-0.5 text-[10px] font-medium text-cream-50">
                    Principale
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Vérification + actions */}
      <Section
        title="Vérification"
        Icon={BadgeCheck}
        aside={<AdminStatusBadge status={profile.verification_status} />}
      >
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="Décision le"
            value={fmt(profile.verification_reviewed_at)}
          />
          <Field
            label="Motif"
            value={profile.verification_rejection_reason || "—"}
          />
          <Field label="Créé le" value={fmtDay(profile.created_at)} />
        </dl>
        <div className="mt-4 border-t border-champagne-500/15 pt-4">
          <ProfileActions
            profileId={profile.id}
            status={profile.verification_status}
          />
        </div>
      </Section>

      {/* Compte + actions */}
      <Section
        title="Compte"
        Icon={ShieldAlert}
        aside={
          <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${accountBadge.className}`}
          >
            <accountBadge.Icon size={13} />
            {accountBadge.label}
          </span>
        }
      >
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Statut" value={accountBadge.label} />
          <Field label="Suspendu le" value={fmt(profile.suspended_at)} />
          <Field label="Motif" value={profile.suspension_reason || "—"} />
        </dl>
        <div className="mt-4 border-t border-champagne-500/15 pt-4">
          <MemberAccountActions
            profileId={profile.id}
            currentStatus={profile.account_status}
          />
        </div>
      </Section>

      {/* Relations : intérêts & matchs */}
      <Section title="Intérêts & matchs" Icon={Heart}>
        {matches.length === 0 ? (
          <p className="text-sm text-ink-700/55">Aucune relation.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-champagne-500/15">
            {matches.map((m) => {
              const otherId = m.user_a === profileId ? m.user_b : m.user_a;
              const dir = m.user_a === profileId ? "Envoyé" : "Reçu";
              const label =
                m.status === "accepted"
                  ? "Match"
                  : m.status === "rejected"
                    ? "Refusé"
                    : dir;
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-ink-800">
                    {nameById.get(otherId)?.trim() || "Membre"}
                  </span>
                  <span className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        m.status === "accepted"
                          ? "bg-emerald-600/10 text-emerald-700"
                          : m.status === "rejected"
                            ? "bg-red-500/10 text-red-700"
                            : "bg-champagne-400/15 text-ink-700/65"
                      }`}
                    >
                      {label}
                    </span>
                    <span className="text-[11px] text-ink-700/50">
                      {fmt(m.created_at)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Signalements reçus */}
      <Section
        title="Signalements reçus"
        Icon={Flag}
        aside={
          reports.length > 0 ? (
            <Link
              href="/admin/reports"
              className="text-xs font-semibold text-champagne-600 hover:text-choco-700"
            >
              Ouvrir les signalements
            </Link>
          ) : undefined
        }
      >
        {reports.length === 0 ? (
          <p className="text-sm text-ink-700/55">Aucun signalement reçu.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-champagne-500/15">
            {reports.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium text-choco-700">
                    {SAFETY_REASON_LABELS[r.reason] ?? "Autre"}
                  </span>
                  {r.details?.trim() ? (
                    <span className="ml-2 truncate text-ink-700/60">
                      {r.details}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-3">
                  <span className="rounded-full bg-champagne-400/15 px-2 py-0.5 text-[11px] font-medium text-ink-700/65">
                    {SAFETY_STATUS_LABELS[r.status]}
                  </span>
                  <span className="text-[11px] text-ink-700/50">
                    {fmt(r.created_at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Historique de modération (member-scoped) */}
      <Section title="Historique de modération" Icon={ScrollText}>
        {history.length === 0 ? (
          <p className="text-sm text-ink-700/55">
            Aucune action de modération enregistrée pour ce membre.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {history.map((e) => (
              <li
                key={e.key}
                className="rounded-xl border border-champagne-500/20 bg-cream-100/40 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-choco-700">
                    {e.actionLabel}
                  </span>
                  <span className="text-[11px] text-ink-700/50">
                    {fmt(e.createdAt)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-700/60">
                  {e.actorEmail ? <span>Par {e.actorEmail}</span> : null}
                  {e.previousStatus && e.newStatus ? (
                    <span>
                      {e.previousStatus} → {e.newStatus}
                    </span>
                  ) : null}
                </div>
                {e.note?.trim() ? (
                  <p className="mt-1 text-xs text-ink-700/75">{e.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Dates importantes */}
      <Section title="Dates importantes" Icon={CalendarClock}>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Inscription" value={fmtDay(profile.created_at)} />
          <Field label="Dernière modification" value={fmt(profile.updated_at)} />
          <Field
            label="Dernière décision de vérification"
            value={fmt(profile.verification_reviewed_at)}
          />
        </dl>
      </Section>
    </div>
  );
}
