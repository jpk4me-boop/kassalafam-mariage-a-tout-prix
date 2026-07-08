"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { browserAuthRedirectUrl } from "@/lib/auth/browser-redirect";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  FormError,
  FormSuccess,
  Input,
  Label,
  PrimaryButton,
} from "@/components/ui/field";

/**
 * Demande de réinitialisation de mot de passe.
 *
 * Envoie le lien EXCLUSIVEMENT via `supabase.auth.resetPasswordForEmail`, avec
 * un `redirectTo` interne fixe (`${getSiteUrl()}/reset-password`) — jamais une
 * valeur contrôlée par l'utilisateur (pas d'open redirect). Le message affiché
 * après envoi est NEUTRE et identique que l'adresse existe ou non : on ne
 * confirme jamais publiquement l'existence d'un compte (anti-énumération).
 */

/** Format email « raisonnable » : partie locale, @, domaine avec un point,
 *  aucun espace. Rejette "", les espaces seuls, "abc", "abc@" ; accepte
 *  "a@b.co". Sert à la fois à activer le bouton et de garde dans handleSubmit. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Empêche toute double soumission (envoi en cours ou déjà envoyé).
    if (loading || sent) return;

    // Seconde protection : la touche Entrée avec une adresse vide/invalide ne
    // doit JAMAIS appeler resetPasswordForEmail (le bouton désactivé étant la
    // première protection).
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError("Veuillez saisir votre adresse email.");
      return;
    }

    setError(null);
    setLoading(true);

    const supabase = createClient();
    // Redirection déclenchée côté navigateur : l'origine visitée (Preview,
    // Production ou local) est respectée — le lien reçu ramène sur le MÊME
    // environnement que celui d'où la demande est partie.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      trimmed,
      { redirectTo: browserAuthRedirectUrl("/reset-password") },
    );

    setLoading(false);

    // Erreur de transport / limitation de débit : indépendante de l'existence du
    // compte (Supabase renvoie un succès pour une adresse inexistante). On
    // affiche un message générique sans rien révéler.
    if (resetError) {
      setError(
        "Envoi impossible pour le moment. Vérifiez votre connexion et réessayez.",
      );
      return;
    }

    // Message neutre : même réponse que l'adresse existe ou non.
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell
        title="Vérifiez votre email"
        subtitle="Un lien de réinitialisation vient de partir."
        footer={
          <Link
            href="/login"
            className="font-semibold text-choco-600 underline-offset-4 hover:underline"
          >
            Retour à la connexion
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-champagne-400/20 text-choco-600">
            <MailCheck size={26} />
          </span>
          <FormSuccess message="Si un compte correspond à cette adresse, un lien de réinitialisation vient d'être envoyé." />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Réinitialiser mon mot de passe"
      subtitle="Saisissez votre adresse email pour recevoir un lien de réinitialisation."
      footer={
        <>
          Vous vous souvenez de votre mot de passe ?{" "}
          <Link
            href="/login"
            className="font-semibold text-choco-600 underline-offset-4 hover:underline"
          >
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error ? <FormError message={error} /> : null}

        <div>
          <Label htmlFor="email">Adresse email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>

        <PrimaryButton
          type="submit"
          disabled={loading || !isValidEmail(email.trim())}
          className="mt-2"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Envoi…
            </>
          ) : (
            "Envoyer le lien"
          )}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
