"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Loader2,
} from "lucide-react";

import { AcquisitionSourceCard } from "@/components/member/acquisition-source-card";
import { DashboardNextSteps } from "@/components/member/dashboard-next-steps";
import { DashboardProfileOverview } from "@/components/member/dashboard-profile-overview";
import { DashboardGuidance } from "@/components/member/dashboard-guidance";
import { DashboardSelection } from "@/components/member/dashboard-selection";
import { MemberNotificationsPanel } from "@/components/member/member-notifications-panel";
import { computeProfileCompletionSummary } from "@/lib/onboarding/completion";
import { createClient } from "@/lib/supabase/client";
import type {
  ProfileRow,
  ProfileVerificationStatus,
} from "@/lib/types/database";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] =
    useState<string | null>(null);
  const [city, setCity] =
    useState<string | null>(null);
  const [country, setCountry] =
    useState<string | null>(null);
  const [completionPercentage, setCompletionPercentage] =
    useState(0);
  const [complete, setComplete] = useState(false);
  const [blurPhotos, setBlurPhotos] = useState(true);

  const [verificationStatus, setVerificationStatus] =
    useState<ProfileVerificationStatus>("pending");

  const [acquisitionRecorded, setAcquisitionRecorded] =
    useState(true);
  const [justRecorded, setJustRecorded] =
    useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const [{ data }, { data: primaryPhoto }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("photos")
            .select("id")
            .eq("profile_id", user.id)
            .eq("is_primary", true)
            .limit(1)
            .maybeSingle(),
        ]);

      if (!active) return;

      const profile =
        (data as ProfileRow | null) ?? null;

      const completion = profile
        ? computeProfileCompletionSummary(
            profile,
            primaryPhoto != null,
          )
        : null;

      setFirstName(profile?.first_name ?? null);
      setCity(profile?.city ?? null);
      setCountry(profile?.country ?? null);

      setCompletionPercentage(
        completion?.percentage ?? 0,
      );

      setComplete(completion?.complete ?? false);
      setBlurPhotos(profile?.blur_photos ?? true);

      setVerificationStatus(
        profile?.verification_status ?? "pending",
      );

      setAcquisitionRecorded(
        profile?.acquisition_source_recorded_at != null,
      );

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
      <DashboardProfileOverview
        firstName={firstName}
        city={city}
        country={country}
        completionPercentage={completionPercentage}
        verificationStatus={verificationStatus}
      />

      <DashboardSelection />

      <DashboardGuidance />

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

      <DashboardNextSteps
        complete={complete}
        verificationStatus={verificationStatus}
        blurPhotos={blurPhotos}
      />

      <MemberNotificationsPanel />

      <p className="text-sm text-ink-700/55">
        La découverte de profils, les mises en relation et la messagerie sont
        ouvertes. Merci de votre confiance.
      </p>
    </div>
  );
}
