"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type {
  Gender,
  MaritalStatus,
  ProfileRow,
  ProfileVerificationStatus,
} from "@/lib/types/database";
import { VerificationBadge } from "@/components/member/verification-badge";
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

type FormState = {
  first_name: string;
  gender: "" | Gender;
  birth_date: string;
  country: string;
  city: string;
  marital_status: "" | MaritalStatus;
  bio: string;
  partner_expectations: string;
  blur_photos: boolean;
};

const EMPTY_FORM: FormState = {
  first_name: "",
  gender: "",
  birth_date: "",
  country: "",
  city: "",
  marital_status: "",
  bio: "",
  partner_expectations: "",
  blur_photos: true,
};

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Vérification admin — LECTURE SEULE. Jamais envoyée dans l'upsert.
  const [verificationStatus, setVerificationStatus] =
    useState<ProfileVerificationStatus>("pending");
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return; // Le middleware redirige normalement déjà.

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
          gender: profile.gender ?? "",
          birth_date: profile.birth_date ?? "",
          country: profile.country ?? "",
          city: profile.city ?? "",
          marital_status: profile.marital_status ?? "",
          bio: profile.bio ?? "",
          partner_expectations: profile.partner_expectations ?? "",
          blur_photos: profile.blur_photos ?? true,
        });
        setVerificationStatus(profile.verification_status ?? "pending");
        setRejectionReason(profile.verification_rejection_reason ?? null);
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
    if (!form.marital_status) {
      setError("Merci d’indiquer votre situation matrimoniale.");
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

    const { error: upsertError } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        first_name: form.first_name.trim() || null,
        gender: form.gender,
        birth_date: form.birth_date || null,
        country: form.country.trim() || null,
        city: form.city.trim() || null,
        marital_status: form.marital_status || null,
        intention: INTENTION_VALUE,
        bio: form.bio.trim() || null,
        partner_expectations: form.partner_expectations.trim() || null,
        blur_photos: form.blur_photos,
      },
      { onConflict: "id" },
    );

    if (upsertError) {
      setError("Enregistrement impossible pour le moment. Réessayez.");
      setSaving(false);
      return;
    }

    setSuccess("Profil enregistré avec succès.");
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-ink-700/60">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
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

      <form
        onSubmit={handleSubmit}
        className="glass flex flex-col gap-5 rounded-3xl p-6 shadow-card sm:p-8"
        noValidate
      >
        {error ? <FormError message={error} /> : null}
        {success ? <FormSuccess message={success} /> : null}

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

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="gender">Genre</Label>
            <Select
              id="gender"
              name="gender"
              required
              value={form.gender}
              onChange={(e) => update("gender", e.target.value as Gender)}
              disabled={saving}
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
              onChange={(e) => update("birth_date", e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="country">Pays</Label>
            <Input
              id="country"
              name="country"
              type="text"
              autoComplete="country-name"
              placeholder="Votre pays"
              value={form.country}
              onChange={(e) => update("country", e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="city">Ville</Label>
            <Input
              id="city"
              name="city"
              type="text"
              autoComplete="address-level2"
              placeholder="Votre ville"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <div>
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
          <Label htmlFor="intention">Intention</Label>
          <Input
            id="intention"
            name="intention"
            type="text"
            value="Mariage sérieux"
            readOnly
            disabled
            className="cursor-default"
          />
          <p className="mt-1.5 text-xs text-ink-700/55">
            La plateforme est dédiée aux projets de mariage sincères.
          </p>
        </div>

        <div>
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

        <div>
          <Label htmlFor="partner_expectations">
            Attentes envers le futur conjoint
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
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-champagne-500/30 bg-cream-100/40 p-4">
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
    </div>
  );
}
