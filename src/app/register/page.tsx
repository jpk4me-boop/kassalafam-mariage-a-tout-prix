"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { REMEMBER_EMAIL_KEY } from "@/lib/auth/remember";
import { sendAnalyticsBeacon } from "@/lib/analytics/client";
import { getSiteUrl } from "@/lib/site-url";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  FormError,
  FormSuccess,
  Input,
  Label,
  PrimaryButton,
} from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  // Mesure interne : « inscription commencée » = première SAISIE réelle dans
  // le formulaire (pas le simple affichage de la page). Envoyé UNE seule fois.
  const startedTracked = useRef(false);
  function trackRegistrationStarted() {
    if (startedTracked.current) return;
    startedTracked.current = true;
    sendAnalyticsBeacon("registration_started", "/register");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    // Redirection explicite du lien de confirmation : ne dépend plus seulement
    // du « Site URL » Supabase. En prod (NEXT_PUBLIC_SITE_URL défini), pointe
    // toujours vers le domaine de production. /login existe déjà et le client
    // navigateur y récupère la session via detectSessionInUrl.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${getSiteUrl()}/login`,
      },
    });

    if (signUpError) {
      setError(
        signUpError.message.includes("already registered")
          ? "Un compte existe déjà avec cet email."
          : "Inscription impossible pour le moment. Réessayez.",
      );
      setLoading(false);
      return;
    }

    if (remember) {
      window.localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim());
    } else {
      window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }

    // Si la confirmation d'email est requise, aucune session n'est ouverte.
    if (!data.session) {
      setNeedsConfirmation(true);
      setLoading(false);
      return;
    }

    // Nouvel inscrit : on démarre le parcours d'onboarding (wizard de création
    // de profil). /profile reste la page de MODIFICATION une fois onboardé.
    router.replace("/onboarding");
    router.refresh();
  }

  if (needsConfirmation) {
    return (
      <AuthShell
        title="Vérifiez votre email"
        subtitle="Une dernière étape avant de commencer."
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
          <FormSuccess
            message={`Nous avons envoyé un lien de confirmation à ${email.trim()}. Cliquez dessus pour activer votre compte.`}
          />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Créer mon profil"
      subtitle="Rejoignez une communauté orientée mariage sérieux."
      footer={
        <>
          Déjà inscrit ?{" "}
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
            onChange={(e) => {
              trackRegistrationStarted();
              setEmail(e.target.value);
            }}
            disabled={loading}
          />
        </div>

        <div>
          <Label htmlFor="password">Mot de passe</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="8 caractères minimum"
            value={password}
            onChange={(e) => {
              trackRegistrationStarted();
              setPassword(e.target.value);
            }}
            disabled={loading}
          />
        </div>

        <div>
          <Label htmlFor="confirm">Confirmer le mot de passe</Label>
          <PasswordInput
            id="confirm"
            name="confirm"
            autoComplete="new-password"
            required
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={loading}
          />
        </div>

        <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-ink-700">
          <input
            type="checkbox"
            name="remember"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            disabled={loading}
            className="h-4 w-4 rounded border-champagne-500/40 accent-choco-600 focus:ring-2 focus:ring-champagne-400/40"
          />
          Se souvenir de moi
        </label>

        <PrimaryButton type="submit" disabled={loading} className="mt-2">
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Création…
            </>
          ) : (
            "Créer mon compte"
          )}
        </PrimaryButton>

        <p className="text-center text-xs text-ink-700/60">
          En créant un compte, vous acceptez notre charte de confidentialité et
          de modération.
        </p>
      </form>
    </AuthShell>
  );
}
