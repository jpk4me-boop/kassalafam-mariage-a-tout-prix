"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Send } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type {
  ChildrenIntent,
  EducationLevel,
  Gender,
  MaritalStatus,
  MarriageGoal,
  PartnerTrait,
  PolygamyPreference,
  ProfileInsert,
  Religion,
} from "@/lib/types/database";
import {
  computeStepCompletion,
  firstIncompleteStep,
  isAdultBirthDate,
  ONBOARDING_TOTAL_STEPS,
  type OnboardingProfileData,
  type OnboardingStep,
} from "@/lib/onboarding/completion";
import {
  clearContinueLaterCookie,
  setContinueLaterCookie,
} from "@/lib/onboarding/continue-later";
import { formFromProfile, type WizardForm } from "@/lib/onboarding/form";
import {
  CHOICE_SET_MAX,
  CHOICE_SET_MIN,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  ORIGIN_CITY_MAX,
  ORIGIN_COUNTRY_MAX,
  PROFESSION_MAX,
  PROFESSION_MIN,
  PROFILE_TEXT_MAX,
  REGION_MAX,
} from "@/lib/onboarding/options";
import { Logo } from "@/components/landing/logo";
import { FormError } from "@/components/ui/field";
import type { ProfilePhotosState } from "@/components/member/profile-photos";
import { AcquisitionStep } from "@/components/onboarding/acquisition-source-form";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { OnboardingIntro } from "@/components/onboarding/onboarding-intro";
import { OnboardingConfirmation } from "@/components/onboarding/onboarding-confirmation";
import { GenderStep } from "@/components/onboarding/steps/gender-step";
import { BirthDateStep } from "@/components/onboarding/steps/birth-date-step";
import { MaritalStatusStep } from "@/components/onboarding/steps/marital-status-step";
import { ProfessionalStep } from "@/components/onboarding/steps/professional-step";
import { LocationStep } from "@/components/onboarding/steps/location-step";
import { MatrimonialStep } from "@/components/onboarding/steps/matrimonial-step";
import { PhotosStep } from "@/components/onboarding/steps/photos-step";

/**
 * Wizard d'onboarding KASSALAFAM (client). Reçoit du Server Component la ligne
 * profil déjà lue (aucun SELECT client redondant) et le mode résolu :
 *   - `acquisition_only` (Mode B) : seule l'étape acquisition, puis redirection ;
 *   - `full` (Mode A) : parcours 8 étapes, reprise à la première étape incomplète
 *     (exigence 3), introduction UNIQUEMENT pour un profil neuf (exigence 4).
 *
 * Chaque étape est sauvegardée IMMÉDIATEMENT (exigence 1) : l'acquisition via la
 * RPC write-once, les autres par upsert de la ligne du membre (RLS owner-only).
 */

type Phase = "intro" | "steps" | "confirm";

function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-champagne-400/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-choco-400/15 blur-3xl"
      />
      <div className="relative w-full max-w-lg">
        <div className="mb-8 flex justify-center">
          <Link href="/" aria-label="Retour à l'accueil KASSALAFAM">
            <Logo />
          </Link>
        </div>
        {children}
      </div>
    </main>
  );
}

export function OnboardingWizard({
  mode,
  userId,
  initialProfile,
  firstNameSuggestion,
  hasPrimaryPhoto,
  redirectTo,
}: {
  mode: "full" | "acquisition_only";
  /** Id du compte connecté — sert uniquement à lier le cookie
   *  « Continuer plus tard » au compte courant (jamais affiché). */
  userId: string;
  initialProfile: OnboardingProfileData;
  /** Suggestion de prénom (métadonnées Auth) : préremplit le champ de
   *  l'étape 2 quand la base n'a rien ; jamais utilisée pour la complétude. */
  firstNameSuggestion?: string | null;
  hasPrimaryPhoto: boolean;
  redirectTo: string;
}) {
  const router = useRouter();

  const [form, setForm] = useState<WizardForm>(() =>
    formFromProfile(initialProfile, firstNameSuggestion),
  );
  const [photoState, setPhotoState] = useState<ProfilePhotosState>(() => ({
    count: hasPrimaryPhoto ? 1 : 0,
    hasPrimary: hasPrimaryPhoto,
  }));

  // Étape de reprise + affichage de l'intro, calculés une seule fois au montage
  // depuis la complétude serveur (source de vérité unique). Toutes les données
  // présentes mais marqueur absent (sinon le Server Component aurait redirigé)
  // → reprise à l'étape 8 pour le clic final explicite « Envoyer mon profil ».
  const [{ initialStep, showIntro }] = useState(() => {
    const completion = computeStepCompletion(initialProfile, hasPrimaryPhoto);
    const first = firstIncompleteStep(completion) ?? ONBOARDING_TOTAL_STEPS;
    return { initialStep: first, showIntro: first === 1 };
  });

  const [phase, setPhase] = useState<Phase>(showIntro ? "intro" : "steps");
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(initialStep);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Une opération photo (upload / principale / suppression) est en cours à
  // l'étape 8. Sert uniquement à masquer « Continuer plus tard » pour ne pas
  // interrompre une écriture Storage/DB en cours.
  const [photoBusy, setPhotoBusy] = useState(false);
  // Source d'acquisition déjà enregistrée : vraie dès le montage pour un profil
  // repris au-delà de l'étape 1, sinon posée à true quand l'étape 1 aboutit.
  const [acquisitionRecorded, setAcquisitionRecorded] = useState(
    () => initialProfile.acquisition_source_recorded_at != null,
  );

  function update<K extends keyof WizardForm>(key: K, value: WizardForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  function goToDestination() {
    setBusy(true);
    router.replace(redirectTo);
    router.refresh();
  }

  /** Sortie « Continuer plus tard » : pose le cookie de session lié au compte
   *  courant (lu par la garde middleware, sinon celle-ci renverrait aussitôt
   *  vers le wizard) puis redirige. Aucune écriture base, aucune RPC. */
  function continueLater() {
    setBusy(true);
    void setContinueLaterCookie(userId).finally(() => {
      router.replace(redirectTo);
      router.refresh();
    });
  }

  /**
   * FIN EXPLICITE du parcours : la RPC serveur revérifie toutes les exigences
   * (acquisition, champs requis, photo principale) et pose le marqueur
   * write-once `onboarding_completed_at`. Succès → cookie « Continuer plus
   * tard » supprimé puis écran de confirmation. Échec → erreur récupérable
   * (le membre reste sur place et peut réessayer).
   */
  async function finalizeOnboarding(): Promise<boolean> {
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("complete_member_onboarding");
    if (rpcError) {
      setError(
        "L’envoi de votre profil n’a pas abouti. Vérifiez votre connexion puis réessayez.",
      );
      return false;
    }
    clearContinueLaterCookie();
    return true;
  }

  // ---- Validation par étape (miroir des contraintes base) -------------------
  function isStepValid(step: OnboardingStep): boolean {
    switch (step) {
      case 1:
        return true; // gérée par AcquisitionStep (RPC).
      case 2:
        return form.first_name.trim().length > 0 && form.gender !== "";
      case 3:
        return isAdultBirthDate(form.birth_date);
      case 4:
        return form.marital_status !== "" && form.religion !== "";
      case 5: {
        const profession = form.profession.trim();
        const height = Number(form.height_cm);
        return (
          profession.length >= PROFESSION_MIN &&
          profession.length <= PROFESSION_MAX &&
          form.education_level !== "" &&
          form.height_cm.trim() !== "" &&
          Number.isInteger(height) &&
          height >= HEIGHT_MIN_CM &&
          height <= HEIGHT_MAX_CM
        );
      }
      case 6:
        return (
          form.origin_country.trim().length > 0 &&
          form.origin_country.trim().length <= ORIGIN_COUNTRY_MAX &&
          form.origin_city.trim().length > 0 &&
          form.origin_city.trim().length <= ORIGIN_CITY_MAX &&
          form.country.trim().length > 0 &&
          form.city.trim().length > 0 &&
          form.region.trim().length > 0 &&
          form.region.trim().length <= REGION_MAX
        );
      case 7:
        return (
          form.marriage_goals.length >= CHOICE_SET_MIN &&
          form.marriage_goals.length <= CHOICE_SET_MAX &&
          form.desired_partner_traits.length >= CHOICE_SET_MIN &&
          form.desired_partner_traits.length <= CHOICE_SET_MAX &&
          form.polygamy_preference !== "" &&
          form.children_intent !== "" &&
          form.bio.trim().length > 0 &&
          form.bio.length <= PROFILE_TEXT_MAX &&
          form.partner_expectations.trim().length > 0 &&
          form.partner_expectations.length <= PROFILE_TEXT_MAX
        );
      case 8:
        return photoState.hasPrimary;
      default:
        return false;
    }
  }

  // ---- Sauvegarde immédiate de l'étape courante -----------------------------
  async function saveStep(step: OnboardingStep): Promise<boolean> {
    // Étapes 1 (acquisition/RPC) et 8 (photos, déjà persistées) : rien à upserter.
    if (step === 1 || step === 8) return true;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent("/onboarding")}`);
      return false;
    }

    let patch: ProfileInsert;
    switch (step) {
      case 2:
        patch = {
          id: user.id,
          first_name: form.first_name.trim(),
          gender: form.gender as Gender,
        };
        break;
      case 3:
        patch = { id: user.id, birth_date: form.birth_date };
        break;
      case 4:
        patch = {
          id: user.id,
          marital_status: form.marital_status as MaritalStatus,
          religion: form.religion as Religion,
        };
        break;
      case 5:
        patch = {
          id: user.id,
          profession: form.profession.trim(),
          education_level: form.education_level as EducationLevel,
          height_cm: Number(form.height_cm),
        };
        break;
      case 6:
        patch = {
          id: user.id,
          origin_country: form.origin_country.trim(),
          origin_city: form.origin_city.trim(),
          country: form.country.trim(),
          city: form.city.trim(),
          region: form.region.trim(),
        };
        break;
      case 7:
        patch = {
          id: user.id,
          marriage_goals: form.marriage_goals as MarriageGoal[],
          desired_partner_traits: form.desired_partner_traits as PartnerTrait[],
          polygamy_preference: form.polygamy_preference as PolygamyPreference,
          children_intent: form.children_intent as ChildrenIntent,
          bio: form.bio.trim(),
          partner_expectations: form.partner_expectations.trim(),
        };
        break;
      default:
        return true;
    }

    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert(patch, { onConflict: "id" });

    if (upsertError) {
      setError("Enregistrement impossible pour le moment. Réessayez.");
      return false;
    }
    return true;
  }

  async function handleNext() {
    if (busy || !isStepValid(currentStep)) return;
    setBusy(true);
    setError(null);
    const ok = await saveStep(currentStep);
    if (!ok) {
      setBusy(false);
      return;
    }

    // Dernière étape : FIN EXPLICITE — la RPC pose le marqueur write-once,
    // puis seulement l'écran de confirmation. Un simple rechargement avant ce
    // clic laisse donc le parcours ouvert (reprise à l'étape 8).
    if (currentStep === ONBOARDING_TOTAL_STEPS) {
      const finalized = await finalizeOnboarding();
      setBusy(false);
      if (!finalized) return;
      setPhase("confirm");
      return;
    }

    setBusy(false);
    setCurrentStep((prev) =>
      Math.min(prev + 1, ONBOARDING_TOTAL_STEPS) as OnboardingStep,
    );
  }

  function handleBack() {
    if (busy || currentStep <= 1) return;
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1) as OnboardingStep);
  }

  // ---- Mode B : étape acquisition, puis FINALISATION, puis redirection ------
  // L'acquisition (RPC write-once) et la finalisation (RPC marqueur) doivent
  // TOUTES DEUX réussir. Si la finalisation échoue après l'acquisition, une
  // erreur récupérable est affichée : l'acquisition étant déjà enregistrée, le
  // bouton « Réessayer » ne rejoue QUE la finalisation.
  async function finalizeAcquisitionOnly() {
    setBusy(true);
    setError(null);
    const finalized = await finalizeOnboarding();
    setBusy(false);
    if (finalized) goToDestination();
  }

  if (mode === "acquisition_only") {
    return (
      <OnboardingShell>
        <div className="glass rounded-3xl p-6 shadow-card sm:p-8">
          {error ? (
            <div className="mb-5 flex flex-col gap-3">
              <FormError message={error} />
              <button
                type="button"
                onClick={() => void finalizeAcquisitionOnly()}
                disabled={busy}
                className="self-start rounded-full border border-champagne-500/40 px-5 py-2 text-sm font-semibold text-choco-700 transition-colors hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Réessayer l’envoi
              </button>
            </div>
          ) : null}
          <AcquisitionStep
            onRecorded={() => void finalizeAcquisitionOnly()}
            disabled={busy}
          />
        </div>
      </OnboardingShell>
    );
  }

  // ---- Mode A : introduction (profil neuf uniquement) -----------------------
  if (phase === "intro") {
    return (
      <OnboardingShell>
        <div className="glass rounded-3xl p-6 shadow-card sm:p-8">
          <OnboardingIntro
            firstName={initialProfile.first_name ?? firstNameSuggestion ?? null}
            onStart={() => setPhase("steps")}
          />
        </div>
      </OnboardingShell>
    );
  }

  // ---- Mode A : confirmation finale -----------------------------------------
  if (phase === "confirm") {
    return (
      <OnboardingShell>
        <div className="glass rounded-3xl p-6 shadow-card sm:p-8">
          <OnboardingConfirmation onContinue={goToDestination} busy={busy} />
        </div>
      </OnboardingShell>
    );
  }

  // ---- Mode A : étapes 1 à 8 ------------------------------------------------
  const showBack = currentStep >= 2;
  const isLastStep = currentStep === ONBOARDING_TOTAL_STEPS;

  // Échappatoire « Continuer plus tard » : uniquement en parcours complet, sur
  // les étapes de profil (après l'acquisition déjà enregistrée), jamais pendant
  // une sauvegarde ni une opération photo. Le clic pose le cookie de session lu
  // par la garde middleware (sinon celle-ci renverrait aussitôt vers le wizard)
  // puis redirige vers la destination sûre déjà résolue — aucune écriture base,
  // aucune RPC.
  const photoOpInProgress = currentStep === 8 && photoBusy;
  const canContinueLater =
    mode === "full" &&
    phase === "steps" &&
    currentStep > 1 &&
    acquisitionRecorded &&
    !busy &&
    !photoOpInProgress;

  return (
    <OnboardingShell>
      <OnboardingProgress step={currentStep} />

      <div className="glass rounded-3xl p-6 shadow-card sm:p-8">
        {error ? (
          <div className="mb-5">
            <FormError message={error} />
          </div>
        ) : null}

        {currentStep === 1 ? (
          // L'étape acquisition porte son propre bouton (appel RPC) ; pas de
          // pied de page générique, et pas de bouton retour (première étape).
          <AcquisitionStep
            onRecorded={() => {
              setAcquisitionRecorded(true);
              setCurrentStep(2);
            }}
            disabled={busy}
          />
        ) : (
          <>
            {currentStep === 2 ? (
              <GenderStep
                firstName={form.first_name}
                value={form.gender}
                onFirstNameChange={(v) => update("first_name", v)}
                onChange={(v) => update("gender", v)}
                disabled={busy}
              />
            ) : null}
            {currentStep === 3 ? (
              <BirthDateStep
                value={form.birth_date}
                onChange={(v) => update("birth_date", v)}
                disabled={busy}
              />
            ) : null}
            {currentStep === 4 ? (
              <MaritalStatusStep
                value={form.marital_status}
                religion={form.religion}
                onChange={(v) => update("marital_status", v)}
                onReligionChange={(v) => update("religion", v)}
                disabled={busy}
              />
            ) : null}
            {currentStep === 5 ? (
              <ProfessionalStep
                profession={form.profession}
                educationLevel={form.education_level}
                heightCm={form.height_cm}
                onProfessionChange={(v) => update("profession", v)}
                onEducationChange={(v) => update("education_level", v)}
                onHeightChange={(v) => update("height_cm", v)}
                disabled={busy}
              />
            ) : null}
            {currentStep === 6 ? (
              <LocationStep
                country={form.country}
                city={form.city}
                originCountry={form.origin_country}
                originCity={form.origin_city}
                region={form.region}
                onCountryChange={(v) => update("country", v)}
                onCityChange={(v) => update("city", v)}
                onOriginCountryChange={(v) => update("origin_country", v)}
                onOriginCityChange={(v) => update("origin_city", v)}
                onRegionChange={(v) => update("region", v)}
                disabled={busy}
              />
            ) : null}
            {currentStep === 7 ? (
              <MatrimonialStep
                marriageGoals={form.marriage_goals}
                partnerTraits={form.desired_partner_traits}
                polygamyPreference={form.polygamy_preference}
                childrenIntent={form.children_intent}
                bio={form.bio}
                partnerExpectations={form.partner_expectations}
                onMarriageGoalsChange={(v) => update("marriage_goals", v)}
                onPartnerTraitsChange={(v) =>
                  update("desired_partner_traits", v)
                }
                onPolygamyChange={(v) => update("polygamy_preference", v)}
                onChildrenChange={(v) => update("children_intent", v)}
                onBioChange={(v) => update("bio", v)}
                onPartnerExpectationsChange={(v) =>
                  update("partner_expectations", v)
                }
                disabled={busy}
              />
            ) : null}
            {currentStep === 8 ? (
              <PhotosStep
                hasPrimary={photoState.hasPrimary}
                onStateChange={setPhotoState}
                onBusyChange={setPhotoBusy}
              />
            ) : null}

            <div className="mt-7 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                {showBack ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-champagne-500/40 bg-cream-50/60 px-5 py-3 text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <ArrowLeft size={16} />
                    Retour
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={handleNext}
                  disabled={busy || !isStepValid(currentStep)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-6 py-3 text-sm font-semibold text-cream-50 shadow-[0_14px_34px_-14px_rgba(43,26,18,0.85)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {busy ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Enregistrement…
                    </>
                  ) : isLastStep ? (
                    <>
                      <Send size={16} />
                      Envoyer mon profil
                    </>
                  ) : (
                    <>
                      Continuer
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>

              {canContinueLater ? (
                <div className="flex flex-col items-center gap-1 text-center">
                  <button
                    type="button"
                    onClick={continueLater}
                    disabled={busy || photoOpInProgress}
                    className="rounded-full px-4 py-2 text-sm font-medium text-choco-700/75 underline-offset-4 transition-colors hover:text-choco-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-400/50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Continuer plus tard
                  </button>
                  <p className="text-xs text-ink-700/55">
                    Les étapes déjà validées sont enregistrées.
                  </p>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </OnboardingShell>
  );
}
