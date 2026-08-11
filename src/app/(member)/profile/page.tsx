"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

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
  ProfileRow,
  ProfileVerificationStatus,
  Religion,
} from "@/lib/types/database";
import {
  CHILDREN_INTENT_OPTIONS,
  CHOICE_SET_MAX,
  CHOICE_SET_MIN,
  EDUCATION_LEVEL_OPTIONS,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  MARRIAGE_GOAL_OPTIONS,
  PARTNER_TRAIT_OPTIONS,
  normalizeWhatsApp,
  POLYGAMY_PREFERENCE_OPTIONS,
  PROFESSION_MAX,
  PSEUDO_MAX,
  PSEUDO_MIN,
  RELIGION_OPTIONS,
  WHATSAPP_PATTERN,
} from "@/lib/onboarding/options";
import { VerificationBadge } from "@/components/member/verification-badge";
import { PageBackNav } from "@/components/member/page-back-nav";
import {
  CONTACT_DETAILS_MESSAGES,
  contactDetailsErrorMessage,
  firstFieldWithContactDetails,
} from "@/lib/profile/contact-details";
import { CountryCityFields } from "@/components/profile/country-city-fields";
import { RegionField } from "@/components/profile/region-field";
import {
  ProfilePhotos,
  type ProfilePhotosState,
} from "@/components/member/profile-photos";
import {
  ProfileCompletionPanel,
  type ProfileCompletionItem,
  type ProfileSection,
} from "@/components/member/profile-completion-panel";
import { ProfileShareConsentCard } from "@/components/member/profile-share-consent-card";
import { ProfilePromotionConsentCard } from "@/components/member/profile-promotion-consent-card";
import { CandidateShowcaseCard } from "@/components/member/candidate-showcase-card";
import { WhatsappNotificationsCard } from "@/components/member/whatsapp-notifications-card";
import { ChoiceCard } from "@/components/onboarding/choice-card";
import { MultiChoiceChips } from "@/components/onboarding/multi-choice-chips";
import {
  FormError,
  FormSuccess,
  Input,
  Label,
  PrimaryButton,
  Select,
  Textarea,
} from "@/components/ui/field";

const INTENTION_VALUE = "mariage_serieux";

function getAdultBirthDateMax(): string {
  const today = new Date();
  const cutoff = new Date(
    today.getFullYear() - 18,
    today.getMonth(),
    today.getDate(),
  );

  const year = cutoff.getFullYear();
  const month = String(cutoff.getMonth() + 1).padStart(2, "0");
  const day = String(cutoff.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const ADULT_BIRTH_DATE_MAX = getAdultBirthDateMax();

/**
 * Le formulaire restitue TOUTES les informations recueillies pendant les
 * 8 étapes de l'inscription — y compris celles qui n'étaient jusqu'ici
 * visibles nulle part après coup (profession, études, taille, région,
 * objectifs de mariage, qualités recherchées, polygamie, projet d'enfants).
 * Mêmes libellés, mêmes composants et mêmes bornes que le wizard : les
 * options viennent de `@/lib/onboarding/options`, miroir des CHECK en base.
 */
/** Nom de famille — miroir du CHECK `profiles_last_name_len` (2..100). */
const LAST_NAME_MIN = 2;
const LAST_NAME_MAX = 100;

// Pseudo affiché : bornes importées du catalogue partagé de l'onboarding
// (PSEUDO_MIN / PSEUDO_MAX — miroir du CHECK `profiles_pseudo_len`, 2..30),
// depuis sa collecte à l'étape 2 du wizard.

// WhatsApp : motif et normalisation importés du catalogue partagé de
// l'onboarding (WHATSAPP_PATTERN / normalizeWhatsApp — miroir du CHECK
// `profiles_whatsapp_phone_format`), depuis que le numéro est requis à
// l'inscription (migration 20260803230000).

type FormState = {
  first_name: string;
  pseudo: string;
  last_name: string;
  whatsapp_phone: string;
  gender: "" | Gender;
  birth_date: string;
  origin_country: string;
  origin_city: string;
  country: string;
  city: string;
  region: string;
  marital_status: "" | MaritalStatus;
  religion: "" | Religion;
  profession: string;
  education_level: "" | EducationLevel;
  height_cm: string;
  marriage_goals: MarriageGoal[];
  desired_partner_traits: PartnerTrait[];
  polygamy_preference: "" | PolygamyPreference;
  children_intent: "" | ChildrenIntent;
  bio: string;
  partner_expectations: string;
  blur_photos: boolean;
  discreet_visits: boolean;
};

const EMPTY_FORM: FormState = {
  first_name: "",
  pseudo: "",
  last_name: "",
  whatsapp_phone: "",
  gender: "",
  birth_date: "",
  origin_country: "",
  origin_city: "",
  country: "",
  city: "",
  region: "",
  marital_status: "",
  religion: "",
  profession: "",
  education_level: "",
  height_cm: "",
  marriage_goals: [],
  desired_partner_traits: [],
  polygamy_preference: "",
  children_intent: "",
  bio: "",
  partner_expectations: "",
  blur_photos: true,
  discreet_visits: false,
};

/** Miroir de `profiles_valid_choice_set(..., 2, 3)` : vide OU 2 à 3 valeurs. */
function isChoiceSetAcceptable(values: readonly string[]): boolean {
  if (values.length === 0) return true;
  return values.length >= CHOICE_SET_MIN && values.length <= CHOICE_SET_MAX;
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // État des photos (compte + photo principale), remonté par ProfilePhotos —
  // alimente UNIQUEMENT le panneau de complétion. null tant que non chargé :
  // l'élément « Photo principale » n'apparaît qu'une fois l'état connu.
  const [photosState, setPhotosState] = useState<ProfilePhotosState | null>(null);
  // Vérification admin — LECTURE SEULE. Jamais envoyée dans l'upsert.
  const [verificationStatus, setVerificationStatus] =
    useState<ProfileVerificationStatus>("pending");
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  // Adresse de connexion (auth.users) — LECTURE SEULE. Affichée pour que le
  // membre sache quelle adresse est rattachée à son compte ; jamais envoyée
  // dans l'upsert et jamais dupliquée dans `profiles`.
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  // Onboarding terminé (marqueur write-once) : pays et ville de résidence
  // deviennent OBLIGATOIRES à l'enregistrement — un profil complet ne peut
  // plus redevenir silencieusement incomplet depuis cette page.
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return; // Le middleware redirige normalement déjà.

      if (active) setAccountEmail(user.email ?? null);

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;
      const profile = data as ProfileRow | null;
      if (profile) {
        setForm({
          first_name: profile.first_name ?? "",
          pseudo: profile.pseudo ?? "",
          last_name: profile.last_name ?? "",
          whatsapp_phone: profile.whatsapp_phone ?? "",
          gender: profile.gender ?? "",
          birth_date: profile.birth_date ?? "",
          origin_country: profile.origin_country ?? "",
          origin_city: profile.origin_city ?? "",
          country: profile.country ?? "",
          city: profile.city ?? "",
          region: profile.region ?? "",
          marital_status: profile.marital_status ?? "",
          religion: profile.religion ?? "",
          profession: profile.profession ?? "",
          education_level: profile.education_level ?? "",
          height_cm:
            profile.height_cm != null ? String(profile.height_cm) : "",
          marriage_goals: profile.marriage_goals ?? [],
          desired_partner_traits: profile.desired_partner_traits ?? [],
          polygamy_preference: profile.polygamy_preference ?? "",
          children_intent: profile.children_intent ?? "",
          bio: profile.bio ?? "",
          partner_expectations: profile.partner_expectations ?? "",
          blur_photos: profile.blur_photos ?? true,
          discreet_visits: profile.discreet_visits ?? false,
        });
        setVerificationStatus(profile.verification_status ?? "pending");
        setRejectionReason(profile.verification_rejection_reason ?? null);
        setOnboardingDone(profile.onboarding_completed_at != null);
      }
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.gender) {
      setError("Merci d’indiquer votre genre.");
      return;
    }
    if (
      !onboardingDone &&
      form.birth_date &&
      form.birth_date > ADULT_BIRTH_DATE_MAX
    ) {
      setError("Vous devez avoir au moins 18 ans.");
      return;
    }
    if (!form.marital_status) {
      setError("Merci d’indiquer votre situation matrimoniale.");
      return;
    }
    // Intégrité du lieu de résidence (PR A géo) : un membre dont l'onboarding
    // est terminé ne peut plus enregistrer un pays ou une ville vides —
    // contrôle AVANT tout appel Supabase, l'ancienne valeur reste intacte.
    if (onboardingDone && !form.country.trim()) {
      setError("Merci d’indiquer votre pays de résidence.");
      return;
    }
    if (onboardingDone && !form.city.trim()) {
      setError("Merci d’indiquer votre ville de résidence.");
      return;
    }

    // Pseudo affiché : facultatif, mais s'il est renseigné il doit respecter
    // le CHECK base (2 à 30 caractères après trim). Tant qu'il est vide, les
    // autres membres voient le prénom (repli en base).
    const pseudo = form.pseudo.trim();

    if (
      pseudo !== "" &&
      (pseudo.length < PSEUDO_MIN || pseudo.length > PSEUDO_MAX)
    ) {
      setError(
        `Le pseudo doit comporter entre ${PSEUDO_MIN} et ${PSEUDO_MAX} caractères.`,
      );
      return;
    }

    // Nom de famille : facultatif, mais s'il est renseigné il doit respecter
    // le CHECK base (2 à 100 caractères après trim).
    const lastName = form.last_name.trim();

    if (
      lastName !== "" &&
      (lastName.length < LAST_NAME_MIN || lastName.length > LAST_NAME_MAX)
    ) {
      setError(
        `Le nom doit comporter entre ${LAST_NAME_MIN} et ${LAST_NAME_MAX} caractères.`,
      );
      return;
    }

    // WhatsApp : normalisé puis validé sur le même motif que la contrainte
    // base. Requis dès lors que le parcours a été finalisé — c'est le canal
    // par lequel le membre est prévenu (migration 20260803230000) ; un profil
    // historique peut encore l'avoir vide et le renseignera ici.
    const whatsapp = normalizeWhatsApp(form.whatsapp_phone.trim());

    if (onboardingDone && whatsapp === "") {
      setError(
        "Merci d’indiquer votre numéro WhatsApp : c’est par là que nous vous prévenons (nouveau message, nouvel intérêt…).",
      );
      return;
    }

    if (whatsapp !== "" && !WHATSAPP_PATTERN.test(whatsapp)) {
      setError(
        "Merci d’indiquer un numéro WhatsApp valide, au format international (par exemple : +237670000000).",
      );
      return;
    }

    // Taille : miroir du CHECK `profiles_height_cm_chk` (120..230). Le champ
    // vide reste accepté pour les profils historiques.
    const heightRaw = form.height_cm.trim();
    let heightValue: number | null = null;

    if (heightRaw !== "") {
      const parsed = Number(heightRaw);

      if (
        !Number.isInteger(parsed) ||
        parsed < HEIGHT_MIN_CM ||
        parsed > HEIGHT_MAX_CM
      ) {
        setError(
          `Merci d’indiquer une taille comprise entre ${HEIGHT_MIN_CM} et ${HEIGHT_MAX_CM} cm.`,
        );
        return;
      }

      heightValue = parsed;
    }

    // Listes de choix : miroir du CHECK base (vide, ou 2 à 3 valeurs uniques).
    if (!isChoiceSetAcceptable(form.marriage_goals)) {
      setError(
        `Merci de sélectionner ${CHOICE_SET_MIN} à ${CHOICE_SET_MAX} objectifs de mariage.`,
      );
      return;
    }
    if (!isChoiceSetAcceptable(form.desired_partner_traits)) {
      setError(
        `Merci de sélectionner ${CHOICE_SET_MIN} à ${CHOICE_SET_MAX} qualités recherchées.`,
      );
      return;
    }

    // Après finalisation, le projet matrimonial ne peut plus redevenir
    // silencieusement incomplet — même esprit que la garde pays / ville.
    if (onboardingDone && form.marriage_goals.length === 0) {
      setError("Merci d’indiquer vos objectifs de mariage.");
      return;
    }
    if (onboardingDone && form.desired_partner_traits.length === 0) {
      setError("Merci d’indiquer les qualités recherchées.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Session expirée. Veuillez vous reconnecter.");
      setSaving(false);
      return;
    }

    const profilePayload: ProfileInsert = {
      id: user.id,
      first_name: form.first_name.trim() || null,
      // Pseudo affiché : remplace le prénom pour les autres membres et le
      // public dès qu'il est renseigné (repli sur le prénom en base sinon).
      pseudo: pseudo || null,
      // Contact privé : jamais affiché publiquement (aucune fonction de
      // partage ne sélectionne ces colonnes).
      last_name: lastName || null,
      whatsapp_phone: whatsapp || null,
      // Origine (PR Origine/Résidence) : compatibilité DOUCE — jamais de
      // chaîne vide (NULL tant que non renseignée, CHECK en base sinon).
      // Pas de garde stricte ici : un profil historique finalisé doit
      // pouvoir enregistrer sa bio sans renseigner l'origine.
      origin_country: form.origin_country.trim() || null,
      origin_city: form.origin_city.trim() || null,
      // Onboarding terminé : jamais null (bloqué par la validation
      // ci-dessus). Parcours non finalisé : comportement historique.
      country: form.country.trim() || null,
      city: form.city.trim() || null,
      region: form.region.trim() || null,
      marital_status: form.marital_status || null,
      // Étapes 5 et 7 de l'inscription, désormais restituées et modifiables.
      // Compatibilité douce : jamais de chaîne vide ni de liste vide — NULL
      // tant qu'un profil historique ne les a pas renseignées.
      profession: form.profession.trim() || null,
      education_level: form.education_level || null,
      height_cm: heightValue,
      marriage_goals:
        form.marriage_goals.length > 0 ? form.marriage_goals : null,
      desired_partner_traits:
        form.desired_partner_traits.length > 0
          ? form.desired_partner_traits
          : null,
      polygamy_preference: form.polygamy_preference || null,
      children_intent: form.children_intent || null,
      // Compatibilité douce (PR B religion) : jamais de chaîne vide — NULL
      // tant qu'un profil historique ne l'a pas renseignée. Une fois choisie,
      // la valeur appartient forcément aux quatre autorisées (CHECK en base).
      religion: form.religion || null,
      intention: INTENTION_VALUE,
      bio: form.bio.trim() || null,
      partner_expectations: form.partner_expectations.trim() || null,
      blur_photos: form.blur_photos,
      discreet_visits: form.discreet_visits,
    };

    // Défense en profondeur : après finalisation, ces propriétés sont
    // totalement absentes du payload — l'UI disabled n'est pas la seule garde.
    if (!onboardingDone) {
      profilePayload.gender = form.gender;
      profilePayload.birth_date = form.birth_date || null;
    }

    // Champs publics : on prévient AVANT l'aller-retour. La base reste
    // l'autorité (trigger profiles_reject_contact_details, migration 59+).
    const offendingField = firstFieldWithContactDetails({
      bio: profilePayload.bio,
      partner_expectations: profilePayload.partner_expectations,
      pseudo: profilePayload.pseudo,
    });

    if (offendingField) {
      setError(CONTACT_DETAILS_MESSAGES[offendingField]);
      setSaving(false);
      return;
    }

    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });

    if (upsertError) {
      setError(
        contactDetailsErrorMessage(upsertError.message, upsertError.details) ??
          "Enregistrement impossible pour le moment. Réessayez.",
      );
      setSaving(false);
      return;
    }

    setSuccess("Profil enregistré avec succès.");
    setSaving(false);
  }

  // --- Panneau de complétion : chaque élément correspond à un champ RÉEL du
  //     formulaire ci-dessous (aucun pourcentage en dur). L'élément « photo
  //     principale » n'apparaît qu'une fois l'état des photos chargé.
  const completionItems: ProfileCompletionItem[] = [
    {
      id: "whatsapp",
      label: "Votre numéro WhatsApp",
      done: form.whatsapp_phone.trim() !== "",
      anchor: "identite",
    },
    {
      id: "origin",
      label: "Votre pays et ville d’origine",
      done: form.origin_country !== "" && form.origin_city !== "",
      anchor: "localisation",
    },
    {
      id: "residence",
      label: "Votre résidence actuelle",
      done: form.country !== "" && form.city !== "",
      anchor: "localisation",
    },
    {
      id: "profession",
      label: "Votre profession",
      done: form.profession.trim() !== "",
      anchor: "parcours",
    },
    {
      id: "situation",
      label: "Votre situation matrimoniale",
      done: form.marital_status !== "",
      anchor: "situation",
    },
    {
      id: "religion",
      label: "Votre religion",
      done: form.religion !== "",
      anchor: "situation",
    },
    {
      id: "intention",
      label: "Votre intention de mariage",
      done: form.marriage_goals.length > 0,
      anchor: "projet",
    },
    {
      id: "polygamie",
      label: "Votre positionnement sur la polygamie",
      done: form.polygamy_preference !== "",
      anchor: "projet",
    },
    {
      id: "enfants",
      label: "Votre projet d’enfants",
      done: form.children_intent !== "",
      anchor: "projet",
    },
    {
      id: "bio",
      label: "Votre présentation",
      done: form.bio.trim() !== "",
      anchor: "presentation",
    },
    {
      id: "attentes",
      label: "Vos attentes envers le futur conjoint",
      done:
        form.desired_partner_traits.length > 0 ||
        form.partner_expectations.trim() !== "",
      anchor: "presentation",
    },
    ...(photosState
      ? [
          {
            id: "photo",
            label: "Votre photo principale",
            done: photosState.hasPrimary,
            anchor: "photos",
          },
        ]
      : []),
  ];

  const anchorComplete = (anchor: string): boolean =>
    completionItems
      .filter((item) => item.anchor === anchor)
      .every((item) => item.done);

  const profileSections: ProfileSection[] = [
    { id: "identite", label: "Identité", anchor: "identite", complete: anchorComplete("identite") },
    { id: "localisation", label: "Origine & résidence", anchor: "localisation", complete: anchorComplete("localisation") },
    { id: "parcours", label: "Parcours", anchor: "parcours", complete: anchorComplete("parcours") },
    { id: "situation", label: "Situation", anchor: "situation", complete: anchorComplete("situation") },
    { id: "projet", label: "Projet", anchor: "projet", complete: anchorComplete("projet") },
    { id: "presentation", label: "Présentation", anchor: "presentation", complete: anchorComplete("presentation") },
    ...(photosState
      ? [{ id: "photos", label: "Photos", anchor: "photos", complete: photosState.hasPrimary }]
      : [{ id: "photos", label: "Photos", anchor: "photos" }]),
    { id: "confidentialite", label: "Confidentialité", anchor: "confidentialite" },
    { id: "notifications", label: "Notifications", anchor: "notifications" },
    { id: "vitrine", label: "Vitrine", anchor: "vitrine" },
    { id: "partage", label: "Partage", anchor: "partage" },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-ink-700/60">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageBackNav />

      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
            Mon profil
          </h1>
          <VerificationBadge status={verificationStatus} />
        </div>
        <p className="mt-2 text-ink-700/75">
          Présentez-vous avec sincérité. Ces informations préparent vos futures
          mises en relation.
        </p>

        {verificationStatus === "rejected" && rejectionReason ? (
          <div
            role="status"
            className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-800"
          >
            <p className="font-medium">Motif à corriger</p>
            <p className="mt-1 whitespace-pre-line text-red-800/85">
              {rejectionReason}
            </p>
          </div>
        ) : null}
      </section>

      {/* Panneau de complétion + sommaire à ancres (inspiration Farata,
          pourcentage RÉEL — voir completionItems ci-dessus). */}
      <ProfileCompletionPanel items={completionItems} sections={profileSections} />

      <form
        onSubmit={handleSubmit}
        className="glass flex flex-col gap-5 rounded-3xl p-6 shadow-card sm:p-8"
        noValidate
      >
        {error ? <FormError message={error} /> : null}
        {success ? <FormSuccess message={success} /> : null}

        <div id="identite" className="grid scroll-mt-28 gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="first_name">Prénom</Label>
            <Input
              id="first_name"
              name="first_name"
              type="text"
              autoComplete="given-name"
              placeholder="Votre prénom"
              value={form.first_name}
              onChange={(e) => update("first_name", e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="last_name">Nom</Label>
            <Input
              id="last_name"
              name="last_name"
              type="text"
              autoComplete="family-name"
              maxLength={LAST_NAME_MAX}
              placeholder="Votre nom de famille"
              value={form.last_name}
              onChange={(e) => update("last_name", e.target.value)}
              disabled={saving}
            />
            <p className="mt-1.5 text-xs text-ink-700/55">
              Jamais affiché publiquement : les autres membres voient votre
              pseudo, ou à défaut votre prénom.
            </p>
          </div>
        </div>

        <div>
          <Label htmlFor="pseudo">Pseudo affiché</Label>
          <Input
            id="pseudo"
            name="pseudo"
            type="text"
            autoComplete="nickname"
            maxLength={PSEUDO_MAX}
            placeholder="Par exemple : Perle237"
            value={form.pseudo}
            onChange={(e) => update("pseudo", e.target.value)}
            disabled={saving}
          />
          <p className="mt-1.5 text-xs text-ink-700/55">
            Facultatif. Dès qu’il est renseigné, ce pseudo remplace votre
            prénom partout où les autres membres et le public voient votre
            profil (découverte, messagerie, vitrine, liens de partage).
          </p>
        </div>

        <div>
          <Label htmlFor="whatsapp_phone">Téléphone (WhatsApp)</Label>
          <Input
            id="whatsapp_phone"
            name="whatsapp_phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={20}
            placeholder="+237670000000"
            value={form.whatsapp_phone}
            onChange={(e) => update("whatsapp_phone", e.target.value)}
            disabled={saving}
          />
          <p className="mt-1.5 text-xs text-ink-700/55">
            Au format international. C’est par là que nous vous prévenons
            (nouveau message, nouvel intérêt, avancement de votre profil). Ce
            numéro reste confidentiel : il n’est jamais transmis aux autres
            membres.
          </p>
        </div>

        {/* Adresse de connexion — lecture seule, lue depuis la session.
            Modifier un identifiant de connexion exige une vérification par
            courriel : cela ne peut pas se faire par simple enregistrement du
            formulaire. */}
        <div>
          <Label htmlFor="account_email">Email</Label>
          <Input
            id="account_email"
            name="account_email"
            type="email"
            value={accountEmail ?? ""}
            placeholder="—"
            readOnly
            disabled
            className="cursor-default"
          />
          <p className="mt-1.5 text-xs text-ink-700/55">
            Adresse rattachée à votre compte, jamais affichée publiquement.
            Pour la modifier, contactez l’assistance.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="gender">Genre</Label>
            <Select
              id="gender"
              name="gender"
              required
              value={form.gender}
              onChange={(e) => update("gender", e.target.value as Gender)}
              disabled={saving || onboardingDone}
            >
              <option value="" disabled>
                Sélectionner…
              </option>
              <option value="homme">Homme</option>
              <option value="femme">Femme</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="birth_date">Date de naissance</Label>
            <Input
              id="birth_date"
              name="birth_date"
              type="date"
              value={form.birth_date}
              max={ADULT_BIRTH_DATE_MAX}
              onChange={(e) => update("birth_date", e.target.value)}
              disabled={saving || onboardingDone}
            />
          </div>
        </div>

        {onboardingDone ? (
          <p className="rounded-2xl border border-champagne-400/35 bg-champagne-100/45 px-4 py-3 text-sm text-ink-700/75">
            Le genre et la date de naissance sont verrouillés après la
            finalisation du profil. Une correction exceptionnelle doit être
            demandée à l’assistance.
          </p>
        ) : null}

        {/* ORIGINE d'abord (PR Origine/Résidence) : mêmes sélecteurs
            dépendants Pays → Ville que la résidence (catalogue unique,
            « Autre ville », valeurs héritées conservées). Instance
            INDÉPENDANTE de la résidence. FACULTATIF pour les profils
            historiques (origin_city NULL) : l'enregistrement des autres
            champs n'est jamais bloqué ; le bandeau « Profil incomplet » du
            dashboard incite à compléter. */}
        <fieldset id="localisation" className="flex scroll-mt-28 flex-col gap-5">
          <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-choco-700/80">
            Origine
          </legend>
          <CountryCityFields
            country={form.origin_country}
            city={form.origin_city}
            onCountryChange={(v) => update("origin_country", v)}
            onCityChange={(v) => update("origin_city", v)}
            disabled={saving}
            idPrefix="profile-origin"
            countryLabel="Pays d’origine"
            cityLabel="Ville d’origine"
          />
        </fieldset>

        {/* RÉSIDENCE ensuite : sélecteurs dépendants (PR A géo), le même
            composant que l'étape 6 de l'onboarding. Les anciennes valeurs
            sont rapprochées par normalisation, jamais effacées. */}
        <fieldset className="flex flex-col gap-5">
          <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-choco-700/80">
            Résidence actuelle
          </legend>
          <CountryCityFields
            country={form.country}
            city={form.city}
            onCountryChange={(v) => update("country", v)}
            onCityChange={(v) => update("city", v)}
            disabled={saving}
            idPrefix="profile-geo"
          />

          {/* Région / zone : rattachée à la résidence — liste déroulante
              pour les pays référencés, saisie libre partout ailleurs. */}
          <RegionField
            country={form.country}
            region={form.region}
            onRegionChange={(v) => update("region", v)}
            disabled={saving}
            id="region"
          />
        </fieldset>

        {/* PROFESSION ET PARCOURS — étape 5 de l'inscription. */}
        <fieldset id="parcours" className="flex scroll-mt-28 flex-col gap-5">
          <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-choco-700/80">
            Profession et parcours
          </legend>

          <div>
            <Label htmlFor="profession">Profession</Label>
            <Input
              id="profession"
              name="profession"
              type="text"
              maxLength={PROFESSION_MAX}
              placeholder="Par exemple : enseignante, ingénieur, commerçant…"
              value={form.profession}
              onChange={(e) => update("profession", e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="education_level">Niveau d’études</Label>
              <Select
                id="education_level"
                name="education_level"
                value={form.education_level}
                onChange={(e) =>
                  update(
                    "education_level",
                    e.target.value as "" | EducationLevel,
                  )
                }
                disabled={saving}
              >
                <option value="" disabled>
                  Sélectionner…
                </option>
                {EDUCATION_LEVEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="height_cm">Taille (cm)</Label>
              <Input
                id="height_cm"
                name="height_cm"
                type="number"
                inputMode="numeric"
                min={HEIGHT_MIN_CM}
                max={HEIGHT_MAX_CM}
                step={1}
                placeholder="Par exemple : 172"
                value={form.height_cm}
                onChange={(e) => update("height_cm", e.target.value)}
                disabled={saving}
              />
              <p className="mt-1.5 text-xs text-ink-700/55">
                Entre {HEIGHT_MIN_CM} et {HEIGHT_MAX_CM} cm.
              </p>
            </div>
          </div>
        </fieldset>

        <div id="situation" className="scroll-mt-28">
          <Label htmlFor="marital_status">Situation matrimoniale</Label>
          <Select
            id="marital_status"
            name="marital_status"
            required
            value={form.marital_status}
            onChange={(e) =>
              update("marital_status", e.target.value as MaritalStatus)
            }
            disabled={saving}
          >
            <option value="" disabled>
              Sélectionner…
            </option>
            <option value="celibataire">Célibataire</option>
            <option value="divorce">Divorcé(e)</option>
            <option value="veuf">Veuf / Veuve</option>
            <option value="separe">Séparé(e)</option>
          </Select>
          <p className="mt-1.5 text-xs text-ink-700/55">
            Une présentation honnête favorise des mises en relation sincères et
            respectueuses.
          </p>
        </div>

        <div>
          <Label htmlFor="religion">Religion</Label>
          <Select
            id="religion"
            name="religion"
            value={form.religion}
            onChange={(e) => update("religion", e.target.value as Religion)}
            disabled={saving}
          >
            <option value="" disabled>
              Sélectionner…
            </option>
            {RELIGION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-xs text-ink-700/55">
            Cette information reste distincte de votre univers de découverte et
            n’est pas affichée publiquement.
          </p>
        </div>

        {/* INTENTION — étape 7 de l'inscription. Le cadre de la plateforme
            (« mariage sérieux ») reste invariant côté base et côté affichage
            public ; ces cases précisent l'intention personnelle du membre. */}
        <div id="projet" className="scroll-mt-28">
          <MultiChoiceChips
            legend="Intention"
            options={MARRIAGE_GOAL_OPTIONS}
            values={form.marriage_goals}
            onChange={(next) => update("marriage_goals", next)}
            disabled={saving}
          />
          <p className="mt-1.5 text-xs text-ink-700/55">
            La plateforme est dédiée aux projets de mariage sincères : précisez
            ce que vous recherchez dans cette démarche.
          </p>
        </div>

        {/* PROJET MATRIMONIAL — étape 7 de l'inscription : positionnement sur
            la polygamie et projet d'enfants, désormais restitués et
            modifiables. Les deux listes à cocher de cette étape sont
            présentées plus haut (Intention) et plus bas (Attentes), au plus
            près des textes libres qu'elles complètent. */}
        <fieldset className="flex flex-col gap-5">
          <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-choco-700/80">
            Projet matrimonial
          </legend>

          <div>
            <Label>Positionnement sur la polygamie</Label>
            <div
              role="radiogroup"
              aria-label="Positionnement sur la polygamie"
              className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
            >
              {POLYGAMY_PREFERENCE_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.value}
                  selected={form.polygamy_preference === option.value}
                  onSelect={() => update("polygamy_preference", option.value)}
                  disabled={saving}
                  title={option.label}
                />
              ))}
            </div>
          </div>

          <div>
            <Label>Projet d’enfants</Label>
            <div
              role="radiogroup"
              aria-label="Projet d'enfants"
              className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
            >
              {CHILDREN_INTENT_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.value}
                  selected={form.children_intent === option.value}
                  onSelect={() => update("children_intent", option.value)}
                  disabled={saving}
                  title={option.label}
                />
              ))}
            </div>
          </div>
        </fieldset>

        <div id="presentation" className="scroll-mt-28">
          <Label htmlFor="bio">Présentation</Label>
          <Textarea
            id="bio"
            name="bio"
            maxLength={2000}
            placeholder="Quelques mots sur vous, vos valeurs et votre projet de foyer…"
            value={form.bio}
            onChange={(e) => update("bio", e.target.value)}
            disabled={saving}
          />
        </div>

        {/* ATTENTES ENVERS LE FUTUR CONJOINT — les qualités recherchées de
            l'étape 7 (2 à 3 choix), puis la précision en texte libre. */}
        <div>
          <MultiChoiceChips
            legend="Attentes envers le futur conjoint"
            options={PARTNER_TRAIT_OPTIONS}
            values={form.desired_partner_traits}
            onChange={(next) => update("desired_partner_traits", next)}
            disabled={saving}
          />
        </div>

        <div>
          <Label htmlFor="partner_expectations">
            Précisez vos attentes
          </Label>
          <Textarea
            id="partner_expectations"
            name="partner_expectations"
            maxLength={2000}
            placeholder="Décrivez les qualités, valeurs et le projet de vie que vous recherchez chez un futur conjoint…"
            value={form.partner_expectations}
            onChange={(e) => update("partner_expectations", e.target.value)}
            disabled={saving}
          />
          <p className="mt-1.5 text-xs text-ink-700/55">
            Soyez précis(e) et bienveillant(e) : cela aide à préparer des
            rencontres réellement compatibles.
          </p>
        </div>

        {/* Confidentialité des photos */}
        <label
          id="confidentialite"
          className="flex scroll-mt-28 cursor-pointer items-start gap-3 rounded-2xl border border-champagne-500/30 bg-cream-100/40 p-4"
        >
          <input
            type="checkbox"
            checked={form.blur_photos}
            onChange={(e) => update("blur_photos", e.target.checked)}
            disabled={saving}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-champagne-500/50 text-choco-600 accent-choco-600"
          />
          <span>
            <span className="flex items-center gap-2 text-sm font-medium text-ink-800">
              <ShieldCheck size={16} className="text-choco-600" />
              Flouter mes photos par défaut
            </span>
            <span className="mt-1 block text-xs text-ink-700/60">
              Vos photos restent floutées tant que vous n’autorisez pas leur
              affichage. Recommandé pour votre confidentialité.
            </span>
          </span>
        </label>

        {/* Visites discrètes (Lot 3) */}
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-champagne-500/30 bg-cream-100/40 p-4">
          <input
            type="checkbox"
            checked={form.discreet_visits}
            onChange={(e) => update("discreet_visits", e.target.checked)}
            disabled={saving}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-champagne-500/50 text-choco-600 accent-choco-600"
          />
          <span>
            <span className="flex items-center gap-2 text-sm font-medium text-ink-800">
              <ShieldCheck size={16} className="text-choco-600" />
              Visites discrètes
            </span>
            <span className="mt-1 block text-xs text-ink-700/60">
              Lorsque vous consultez le détail d’un profil, votre visite n’est
              ni enregistrée ni visible par le membre consulté.
            </span>
          </span>
        </label>

        <PrimaryButton type="submit" disabled={saving} className="sm:w-auto sm:self-end sm:px-10">
          {saving ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Enregistrement…
            </>
          ) : (
            "Enregistrer mon profil"
          )}
        </PrimaryButton>
      </form>

      {/* Photos de profil — gestion privée du membre connecté (L3D-A).
          onStateChange alimente le panneau de complétion (photo principale). */}
      <div id="photos" className="scroll-mt-28">
        <ProfilePhotos onStateChange={setPhotosState} />
      </div>

      {/* Vitrine publique /candidats — consentement puis publication, deux
          gestes explicites et séparés, retrait à tout moment. */}
      <div id="notifications" className="scroll-mt-28">
        <WhatsappNotificationsCard />
      </div>

      <div id="vitrine" className="scroll-mt-28">
        <CandidateShowcaseCard />
      </div>

      {/* Consentement au partage public limité (PR1 partage de profils) */}
      <div id="partage" className="scroll-mt-28">
        <ProfileShareConsentCard />
      </div>

      {/* Consentement distinct pour la promotion sur les réseaux sociaux */}
      <ProfilePromotionConsentCard />
    </div>
  );
}
