"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CircleAlert,
  Loader2,
  UserRound,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { isProfileDataComplete } from "@/lib/onboarding/completion";
import type { ProfileRow, ProfileVerificationStatus } from "@/lib/types/database";
import { VerificationBadge } from "@/components/member/verification-badge";
import { MemberNotificationsPanel } from "@/components/member/member-notifications-panel";
import { DashboardNextSteps } from "@/components/member/dashboard-next-steps";
import { AcquisitionSourceCard } from "@/components/member/acquisition-source-card";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [blurPhotos, setBlurPhotos] = useState(true);
  const [verificationStatus, setVerificationStatus] =
    useState<ProfileVerificationStatus>("pending");
  // Onboarding acquisition (« Comment nous as-tu découverts ? ») : témoin
  // write-once. `acquisitionRecorded` = la source est déjà enregistrée (au
  // chargement ou à l'instant). `justRecorded` sert uniquement à afficher une
  // confirmation non intrusive après un enregistrement fait dans cette session.
  const [acquisitionRecorded, setAcquisitionRecorded] = useState(true);
  const [justRecorded, setJustRecorded] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return; // Le middleware redirige normalement déjà.

      // Complétude DYNAMIQUE canonique (mêmes règles que le wizard) : profil
      // + existence d'une photo principale. Indépendante du marqueur
      // d'onboarding : un membre peut redevenir incomplet via /profile sans
      // que son parcours initial rouvre.
      const [{ data }, { data: primaryPhoto }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase
          .from("photos")
          .select("id")
          .eq("profile_id", user.id)
          .eq("is_primary", true)
          .limit(1)
          .maybeSingle(),
      ]);

      if (!active) return;
      const profile = (data as ProfileRow | null) ?? null;
      setFirstName(profile?.first_name ?? null);
      setComplete(
        profile != null && isProfileDataComplete(profile, primaryPhoto != null),
      );
      setBlurPhotos(profile?.blur_photos ?? true);
      setVerificationStatus(profile?.verification_status ?? "pending");
      setAcquisitionRecorded(profile?.acquisition_source_recorded_at != null);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-ink-700/60">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Espace membre
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
          Bienvenue{firstName ? `, ${firstName}` : ""} sur Mariage à Tout Prix
        </h1>
        <p className="mt-3 max-w-xl text-ink-700/75">
          Votre parcours vers une rencontre sincère et orientée foyer commence
          ici. Complétez votre profil pour préparer vos futures mises en
          relation.
        </p>
      </section>

      {/* Onboarding — « Comment nous as-tu découverts ? » (source d'acquisition).
          Affichée uniquement tant que la réponse n'est pas enregistrée. Après un
          enregistrement réussi, la carte disparaît immédiatement (sans reload) et
          une confirmation sobre s'affiche. Jamais de réponse enregistrée montrée
          ni de modification possible. */}
      {!acquisitionRecorded ? (
        <AcquisitionSourceCard
          onRecorded={() => {
            setAcquisitionRecorded(true);
            setJustRecorded(true);
          }}
        />
      ) : justRecorded ? (
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
          <BadgeCheck size={16} />
          Merci, ta réponse a bien été enregistrée.
        </p>
      ) : null}

      {/* Statut du profil */}
      <section
        className={`rounded-3xl border p-6 shadow-card sm:p-8 ${
          complete
            ? "border-emerald-600/25 bg-emerald-600/5"
            : "border-champagne-500/30 bg-cream-100/50"
        }`}
      >
        <div className="flex items-start gap-4">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
              complete
                ? "bg-emerald-600/15 text-emerald-700"
                : "bg-champagne-400/20 text-choco-600"
            }`}
          >
            {complete ? <BadgeCheck size={24} /> : <CircleAlert size={24} />}
          </span>

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-serif text-xl font-semibold text-choco-700">
                {complete ? "Profil complet" : "Profil incomplet"}
              </h2>
              <VerificationBadge status={verificationStatus} />
            </div>
            <p className="mt-1 text-sm text-ink-700/75">
              {complete
                ? "Toutes les informations essentielles sont renseignées. Vous êtes prêt(e)."
                : "Quelques informations manquent pour finaliser votre présentation."}
            </p>

            <Link
              href="/profile"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
            >
              <UserRound size={16} />
              {complete ? "Modifier mon profil" : "Compléter mon profil"}
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Cartes utiles après complétion du profil (L3C-A) */}
      <DashboardNextSteps
        complete={complete}
        verificationStatus={verificationStatus}
        blurPhotos={blurPhotos}
      />

      {/* Notifications de vérification (L3-C) */}
      <MemberNotificationsPanel />

      <p className="text-sm text-ink-700/55">
        Les mises en relation, la messagerie et l’accompagnement arriveront
        prochainement. Merci de votre confiance.
      </p>
    </div>
  );
}
