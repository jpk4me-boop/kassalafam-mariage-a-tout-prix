import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  MapPin,
  UserRound,
} from "lucide-react";

import { VerificationBadge } from "@/components/member/verification-badge";
import type { ProfileVerificationStatus } from "@/lib/types/database";

type DashboardProfileOverviewProps = Readonly<{
  firstName: string | null;
  city: string | null;
  country: string | null;
  completionPercentage: number;
  verificationStatus: ProfileVerificationStatus;
}>;

export function DashboardProfileOverview({
  firstName,
  city,
  country,
  completionPercentage,
  verificationStatus,
}: DashboardProfileOverviewProps) {
  const percentage = Math.max(
    0,
    Math.min(100, completionPercentage),
  );

  const complete = percentage === 100;

  const location =
    [city, country].filter(Boolean).join(" · ") ||
    "Localisation à compléter";

  return (
    <section className="overflow-hidden rounded-[2rem] border border-champagne-500/30 bg-cream-50/80 shadow-card">
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-champagne-600">
            Espace membre
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
              {firstName
                ? "Bonjour, " + firstName
                : "Bonjour"}
            </h1>

            <VerificationBadge status={verificationStatus} />
          </div>

          <p className="mt-3 flex items-center gap-2 text-sm text-ink-700/65">
            <MapPin
              size={16}
              className="shrink-0 text-choco-600"
            />
            {location}
          </p>

          <p className="mt-4 max-w-xl text-sm leading-6 text-ink-700/75 sm:text-base">
            {complete
              ? "Votre profil matrimonial contient toutes les informations essentielles."
              : "Un profil bien renseigné aide les membres compatibles à mieux comprendre votre projet matrimonial."}
          </p>
        </div>

        <div className="rounded-3xl border border-champagne-500/25 bg-cream-100/55 p-5 sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-choco-700">
                Complétude du profil
              </p>

              <p className="mt-1 text-xs text-ink-700/55">
                Informations essentielles et photo principale
              </p>
            </div>

            <strong className="font-serif text-3xl font-semibold text-choco-700">
              {percentage}%
            </strong>
          </div>

          <div
            role="progressbar"
            aria-label="Complétude du profil"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage}
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-champagne-400/25"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-champagne-500 via-choco-500 to-choco-700 transition-[width] duration-500"
              style={{ width: percentage + "%" }}
            />
          </div>

          <Link
            href="/profile"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
          >
            {complete ? (
              <CircleCheck size={16} />
            ) : (
              <UserRound size={16} />
            )}

            {complete
              ? "Modifier mon profil"
              : "Compléter mon profil"}

            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
