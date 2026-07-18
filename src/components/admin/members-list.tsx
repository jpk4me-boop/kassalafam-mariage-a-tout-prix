import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  Flag,
  Heart,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";

import type { AdminMemberListItem } from "@/lib/types/database";
import { ageFromBirthDate } from "@/lib/admin/analytics";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { ACCOUNT_STATUS_BADGE } from "@/lib/admin/account-moderation";
import type { PresenceInfo } from "@/lib/admin/presence";

/**
 * Liste des membres (présentation SEULE, rendue côté serveur). N'affiche que des
 * informations administrativement utiles ; aucune donnée sensible (pas d'email
 * ici, pas de storage_path, pas de contenu privé). Tableau lisible sur desktop,
 * cartes sur mobile.
 */

function AccountBadge({ status }: { status: AdminMemberListItem["account_status"] }) {
  const { label, Icon, className } = ACCOUNT_STATUS_BADGE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      <Icon size={13} />
      {label}
    </span>
  );
}

function Avatar({
  name,
  url,
}: {
  name: string | null;
  url: string | null;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={44}
        height={44}
        className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-champagne-500/30"
      />
    );
  }
  const initial = name?.trim()?.[0]?.toUpperCase() ?? null;
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-choco-600/10 text-choco-600 ring-1 ring-champagne-500/25">
      {initial ? (
        <span className="text-sm font-semibold">{initial}</span>
      ) : (
        <UserRound size={20} aria-hidden />
      )}
    </span>
  );
}

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

function completenessBadge(isComplete: boolean) {
  return isComplete ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600/25 bg-emerald-600/5 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
      <Sparkles size={11} /> Complet
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-champagne-500/30 bg-champagne-400/10 px-2 py-0.5 text-[11px] font-medium text-ink-700/60">
      Incomplet
    </span>
  );
}

function Stat({
  Icon,
  value,
  label,
  tone = "default",
}: {
  Icon: typeof Camera;
  value: number;
  label: string;
  tone?: "default" | "alert";
}) {
  return (
    <span
      title={label}
      className={`inline-flex items-center gap-1 text-xs ${
        tone === "alert" && value > 0
          ? "font-semibold text-red-700"
          : "text-ink-700/70"
      }`}
    >
      <Icon size={13} aria-hidden />
      {value}
    </span>
  );
}

/** Pastille compacte de présence (« En ligne » vert, sinon date relative). */
function PresenceChip({ presence }: { presence: PresenceInfo | undefined }) {
  if (!presence) {
    return <span className="text-[11px] text-ink-700/45">Jamais vu</span>;
  }
  return (
    <span
      title={presence.absolute ?? undefined}
      className={`inline-flex items-center gap-1.5 text-[11px] ${
        presence.online ? "font-semibold text-emerald-700" : "text-ink-700/55"
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${
          presence.online ? "bg-emerald-500" : "bg-ink-700/30"
        }`}
      />
      {presence.label}
    </span>
  );
}

export function MembersList({
  items,
  avatarById,
  presenceById,
  now,
}: {
  items: AdminMemberListItem[];
  avatarById: Map<string, string | null>;
  presenceById: Map<string, PresenceInfo>;
  now: Date;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-champagne-500/25 bg-cream-100/40 px-6 py-14 text-center">
        <Users size={26} className="text-ink-700/40" aria-hidden />
        <p className="text-sm text-ink-700/60">
          Aucun membre ne correspond à ces critères.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Vue bureau : tableau */}
      <div className="hidden overflow-x-auto rounded-2xl border border-champagne-500/25 bg-cream-50/60 lg:block">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-champagne-500/25 text-xs uppercase tracking-wide text-ink-700/55">
              <th className="px-4 py-3 font-medium">Membre</th>
              <th className="px-4 py-3 font-medium">Résidence</th>
              <th className="px-4 py-3 font-medium">Compte</th>
              <th className="px-4 py-3 font-medium">Vérification</th>
              <th className="px-4 py-3 font-medium">Profil</th>
              <th className="px-4 py-3 font-medium">Activité</th>
              <th className="px-4 py-3 font-medium">Inscription</th>
              <th className="px-4 py-3 font-medium sr-only">Fiche</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => {
              const age = ageFromBirthDate(m.birth_date, now);
              return (
                <tr
                  key={m.id}
                  className="border-b border-champagne-500/10 align-middle last:border-0 hover:bg-champagne-400/5"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.first_name} url={avatarById.get(m.id) ?? null} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-choco-700">
                          {m.first_name?.trim() || (
                            <span className="text-ink-700/40">Sans prénom</span>
                          )}
                          {age !== null ? (
                            <span className="ml-1 text-ink-700/50">· {age} ans</span>
                          ) : null}
                        </p>
                        {m.email ? (
                          <p className="truncate text-xs text-ink-700/60">
                            {m.email}
                          </p>
                        ) : null}
                        <div className="mt-1 flex items-center gap-2">
                          {completenessBadge(m.is_complete)}
                          <PresenceChip presence={presenceById.get(m.id)} />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-700/75">
                    {m.city?.trim() || "—"}
                    {m.country?.trim() ? (
                      <span className="text-ink-700/45">, {m.country}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <AccountBadge status={m.account_status} />
                  </td>
                  <td className="px-4 py-3">
                    <AdminStatusBadge status={m.verification_status} />
                  </td>
                  <td className="px-4 py-3">
                    <Stat Icon={Camera} value={m.photos_count} label="Photos" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Stat Icon={Heart} value={m.interests_count} label="Intérêts" />
                      <Stat Icon={BadgeCheck} value={m.matches_count} label="Matchs" />
                      <Stat
                        Icon={Flag}
                        value={m.reports_count}
                        label="Signalements"
                        tone="alert"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-700/70">
                    {formatDate(m.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/members/${m.id}`}
                      className="inline-flex items-center gap-1 rounded-full border border-champagne-500/30 bg-cream-100/60 px-3 py-1.5 text-xs font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15"
                    >
                      Fiche
                      <ArrowRight size={13} aria-hidden />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Vue mobile : cartes */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {items.map((m) => {
          const age = ageFromBirthDate(m.birth_date, now);
          return (
            <li
              key={m.id}
              className="rounded-2xl border border-champagne-500/25 bg-cream-50/60 p-4"
            >
              <Link href={`/admin/members/${m.id}`} className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <Avatar name={m.first_name} url={avatarById.get(m.id) ?? null} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-choco-700">
                      {m.first_name?.trim() || (
                        <span className="text-ink-700/40">Sans prénom</span>
                      )}
                      {age !== null ? (
                        <span className="ml-1 text-ink-700/50">· {age} ans</span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-ink-700/70">
                      {m.city?.trim() || "—"}
                      {m.country?.trim() ? `, ${m.country}` : ""}
                    </p>
                    {m.email ? (
                      <p className="truncate text-[11px] text-ink-700/55">
                        {m.email}
                      </p>
                    ) : null}
                  </div>
                  <ArrowRight size={16} className="mt-1 shrink-0 text-ink-700/40" aria-hidden />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <AccountBadge status={m.account_status} />
                  <AdminStatusBadge status={m.verification_status} />
                  {completenessBadge(m.is_complete)}
                  <PresenceChip presence={presenceById.get(m.id)} />
                </div>

                <div className="flex items-center gap-4 border-t border-champagne-500/15 pt-2">
                  <Stat Icon={Camera} value={m.photos_count} label="Photos" />
                  <Stat Icon={Heart} value={m.interests_count} label="Intérêts" />
                  <Stat Icon={BadgeCheck} value={m.matches_count} label="Matchs" />
                  <Stat
                    Icon={Flag}
                    value={m.reports_count}
                    label="Signalements"
                    tone="alert"
                  />
                  <span className="ml-auto text-[11px] text-ink-700/55">
                    {formatDate(m.created_at)}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
