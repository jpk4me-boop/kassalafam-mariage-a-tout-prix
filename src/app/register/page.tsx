"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  FormError,
  FormSuccess,
  Input,
  Label,
  PrimaryButton,
} from "@/components/ui/field";

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

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
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
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

    // Si la confirmation d'email est requise, aucune session n'est ouverte.
    if (!data.session) {
      setNeedsConfirmation(true);
      setLoading(false);
      return;
    }

    router.replace("/profile");
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
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>

        <div>
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="8 caractères minimum"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>

        <div>
          <Label htmlFor="confirm">Confirmer le mot de passe</Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={loading}
          />
        </div>

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
