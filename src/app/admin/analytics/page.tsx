import Link from "next/link";
import { TriangleAlert, Info, UserMinus, UserCheck } from "lucide-react";

import { requireAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeAnalytics,
  isAnalyticsPeriod,
  ANALYTICS_PERIODS,
  UNAVAILABLE_METRICS,
  type AnalyticsPeriod,
  type AnalyticsInput,
} from "@/lib/admin/analytics";
import {
  Section,
  StatGrid,
  StatCard,
  BarList,
  FunnelBars,
  TrendBars,
  fmt,
} from "@/components/admin/analytics-ui";

// Rendu dynamique : session + searchParams + env serveur. Jamais pré-rendu.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Statistiques & Analyses — Administration",
};

const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  "7d": "les 7 derniers jours",
  "30d": "les 30 derniers jours",
  "90d": "les 90 derniers jours",
  all: "toute la période",
};

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  // 1. Garde admin (super admin inclus) — 100 % côté serveur.
  await requireAdmin("/admin/analytics");

  const { period: periodParam } = await searchParams;
  const period: AnalyticsPeriod = isAnalyticsPeriod(periodParam)
    ? periodParam
    : "30d";

  // 2. Lecture privilégiée READ-ONLY (service_role, serveur uniquement),
  //    UNIQUEMENT après validation du rôle. Toute l'agrégation se fait côté
  //    serveur : aucune donnée personnelle de ligne n'atteint le navigateur.
  let loadError: string | null = null;
  let input: AnalyticsInput | null = null;

  try {
    const admin = createAdminClient();

    const [
      profilesRes,
      photosRes,
      matchesRes,
      messagesRes,
      reportsRes,
      moderationRes,
    ] = await Promise.all([
      admin
        .from("profiles")
        .select(
          "id, first_name, gender, birth_date, country, city, marital_status, bio, partner_expectations, intention, blur_photos, is_premium, discovery_universe, verification_status, account_status, created_at",
        ),
      admin.from("photos").select("profile_id, is_primary"),
      admin.from("matches").select("user_a, user_b, status, created_at"),
      admin.from("messages").select("sender_id, match_id, created_at"),
      admin.from("safety_reports").select("status, created_at"),
      admin
        .from("account_moderation_actions")
        .select("new_status, previous_status, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    const firstError =
      profilesRes.error ||
      photosRes.error ||
      matchesRes.error ||
      messagesRes.error ||
      reportsRes.error ||
      moderationRes.error;
    if (firstError) throw firstError;

    input = {
      profiles: profilesRes.data ?? [],
      photos: photosRes.data ?? [],
      matches: matchesRes.data ?? [],
      messages: messagesRes.data ?? [],
      safetyReports: reportsRes.data ?? [],
      moderationActions: moderationRes.data ?? [],
    };
  } catch (err) {
    loadError =
      err instanceof Error ? err.message : "Lecture des données indisponible.";
  }

  if (loadError || !input) {
    return (
      <div className="flex flex-col gap-6">
        <AnalyticsHeader period={period} />
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-800">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Lecture admin indisponible</p>
            <p className="mt-1 text-red-800/80">
              Vérifiez que <code>SUPABASE_SERVICE_ROLE_KEY</code> est définie
              côté serveur. Détail : {loadError}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const now = new Date();
  const a = computeAnalytics(input, period, now);
  const { members, engagement, security } = a;
  const scoped = PERIOD_LABEL[period];

  return (
    <div className="flex flex-col gap-10">
      <AnalyticsHeader period={period} />

      {/* A. Membres — instantané d'état actuel */}
      <Section
        title="Membres"
        description="État actuel de la base (instantané, hors filtre de période)."
      >
        <StatGrid>
          <StatCard label="Profils au total" value={members.total} />
          <StatCard
            label="Nouveaux · 7 jours"
            value={members.new7d}
            tone="positive"
          />
          <StatCard label="Nouveaux · 30 jours" value={members.new30d} />
          <StatCard
            label="Avec photo principale"
            value={members.withPrimaryPhoto}
          />
          <StatCard
            label="Profils complets"
            value={members.complete}
            hint={`${fmt(members.incomplete)} incomplet(s)`}
          />
          <StatCard label="Vérifiés" value={members.verified} tone="positive" />
          <StatCard
            label="En attente"
            value={members.pending}
            tone="warning"
          />
          <StatCard label="Refusés" value={members.rejected} tone="danger" />
          <StatCard label="En pause" value={members.paused} tone="warning" />
          <StatCard label="Comptes actifs" value={members.active} />
          <StatCard
            label="Comptes suspendus"
            value={members.suspended}
            tone={members.suspended > 0 ? "danger" : "default"}
          />
        </StatGrid>
        <p className="text-xs text-ink-700/55">
          « Profil complet » = tous les champs essentiels renseignés (prénom,
          genre, date de naissance, pays, ville, situation, présentation,
          attentes).
        </p>
      </Section>

      {/* B. Engagement — filtré par période */}
      <Section
        title="Engagement"
        description={`Activité relationnelle sur ${scoped} (par date d’expression de l’intérêt / d’envoi).`}
      >
        <StatGrid>
          <StatCard label="Intérêts exprimés" value={engagement.interestsSent} />
          <StatCard
            label="Intérêts acceptés"
            value={engagement.interestsAccepted}
            tone="positive"
          />
          <StatCard
            label="Intérêts refusés"
            value={engagement.interestsRejected}
            tone="danger"
          />
          <StatCard
            label="Intérêts en attente"
            value={engagement.interestsPending}
            tone="warning"
          />
          <StatCard
            label="Matchs (mutuels)"
            value={engagement.matchesCreated}
            tone="positive"
          />
          <StatCard
            label="Conversations actives"
            value={engagement.activeConversations}
            hint="≥ 1 message échangé"
          />
          <StatCard label="Messages envoyés" value={engagement.messagesSent} />
          <StatCard
            label="Membres avec un match"
            value={engagement.usersWithMatch}
          />
        </StatGrid>
      </Section>

      {/* C. Sécurité — instantané + actions récentes */}
      <Section
        title="Sécurité & modération"
        description="Signalements et sanctions de comptes (état actuel)."
      >
        <StatGrid>
          <StatCard
            label="Signalements ouverts"
            value={security.reportsOpen}
            tone={security.reportsOpen > 0 ? "warning" : "default"}
          />
          <StatCard label="En cours de revue" value={security.reportsReviewing} />
          <StatCard
            label="Résolus"
            value={security.reportsResolved}
            tone="positive"
          />
          <StatCard label="Classés sans suite" value={security.reportsDismissed} />
          <StatCard
            label="Comptes suspendus"
            value={security.suspendedAccounts}
            tone={security.suspendedAccounts > 0 ? "danger" : "default"}
          />
        </StatGrid>

        <div className="rounded-2xl border border-champagne-500/25 bg-cream-100/50 p-5 shadow-card">
          <h3 className="text-sm font-semibold text-choco-700">
            Actions de modération récentes
          </h3>
          {security.recentModeration.length === 0 ? (
            <p className="mt-3 text-sm text-ink-700/60">
              Aucune action de modération de compte enregistrée.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-champagne-500/15">
              {security.recentModeration.map((action, index) => {
                const suspended = action.newStatus === "suspended";
                return (
                  <li
                    key={`${action.createdAt}-${index}`}
                    className="flex items-start gap-3 py-2.5"
                  >
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        suspended
                          ? "bg-red-500/10 text-red-700"
                          : "bg-emerald-600/10 text-emerald-700"
                      }`}
                    >
                      {suspended ? (
                        <UserMinus size={15} aria-hidden />
                      ) : (
                        <UserCheck size={15} aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-choco-700">
                        {suspended
                          ? "Compte suspendu"
                          : "Compte réactivé"}
                      </p>
                      <p className="truncate text-xs text-ink-700/60" title={action.reason}>
                        {action.reason}
                      </p>
                    </div>
                    <time
                      className="shrink-0 text-xs tabular-nums text-ink-700/50"
                      dateTime={action.createdAt}
                    >
                      {new Date(action.createdAt).toLocaleDateString("fr-FR")}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>

      {/* D. Conversion — cohorte de la période */}
      <Section
        title="Entonnoir de conversion"
        description={`Cohorte des membres inscrits sur ${scoped} (${fmt(a.cohortSize)} profil(s)) et leur progression.`}
      >
        <div className="rounded-2xl border border-champagne-500/25 bg-cream-100/50 p-5 shadow-card">
          <FunnelBars steps={a.funnel} />
        </div>
      </Section>

      {/* E. Répartition — cohorte de la période */}
      <Section
        title="Répartition"
        description={`Sur la cohorte inscrite pendant ${scoped}.`}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-champagne-500/25 bg-cream-100/50 p-5 shadow-card">
            <h3 className="mb-3 text-sm font-semibold text-choco-700">
              Par pays
            </h3>
            <BarList items={a.byCountry} />
          </div>
          <div className="rounded-2xl border border-champagne-500/25 bg-cream-100/50 p-5 shadow-card">
            <h3 className="mb-3 text-sm font-semibold text-choco-700">
              Par ville
            </h3>
            <BarList items={a.byCity} />
          </div>
          <div className="rounded-2xl border border-champagne-500/25 bg-cream-100/50 p-5 shadow-card">
            <h3 className="mb-3 text-sm font-semibold text-choco-700">
              Par tranche d’âge
            </h3>
            <BarList
              items={a.byAgeBucket}
              emptyLabel="Aucune date de naissance renseignée sur la cohorte."
            />
          </div>
          <div className="rounded-2xl border border-champagne-500/25 bg-cream-100/50 p-5 shadow-card">
            <h3 className="mb-3 text-sm font-semibold text-choco-700">
              Tendance d’inscription
            </h3>
            <TrendBars
              points={a.registrationTrend}
              granularity={a.trendGranularity}
            />
          </div>
        </div>
      </Section>

      {/* Transparence : métriques non disponibles avec le schéma actuel */}
      <Section title="Non disponible">
        <div className="flex items-start gap-3 rounded-2xl border border-champagne-500/25 bg-champagne-400/5 px-5 py-4">
          <Info size={18} className="mt-0.5 shrink-0 text-champagne-600" />
          <div className="text-sm text-ink-700/75">
            <p className="font-medium text-choco-700">
              Métriques volontairement non affichées
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {UNAVAILABLE_METRICS.map((m) => (
                <li key={m.label}>
                  <span className="font-medium">{m.label}</span> — {m.reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}

function AnalyticsHeader({ period }: { period: AnalyticsPeriod }) {
  return (
    <header className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Back-office
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
          Statistiques &amp; Analyses
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-700/70">
          Données agrégées en lecture seule, calculées directement à partir du
          schéma Supabase. Aucune donnée personnelle n’est exposée.
        </p>
      </div>

      {/* Filtre de période */}
      <nav className="flex flex-wrap gap-2" aria-label="Filtre de période">
        {ANALYTICS_PERIODS.map((p) => {
          const isActive = p.key === period;
          const href =
            p.key === "30d"
              ? "/admin/analytics"
              : `/admin/analytics?period=${p.key}`;
          return (
            <Link
              key={p.key}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-choco-600/30 bg-choco-600/10 text-choco-700"
                  : "border-champagne-500/30 bg-cream-100/50 text-ink-700/70 hover:text-choco-600"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
