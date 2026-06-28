"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { REMEMBER_EMAIL_KEY } from "@/lib/auth/remember";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormError, Input, Label, PrimaryButton } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Préremplit l'email si l'utilisateur avait coché « Se souvenir de moi ».
  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(
        signInError.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect."
          : "Connexion impossible pour le moment. Réessayez.",
      );
      setLoading(false);
      return;
    }

    if (remember) {
      window.localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim());
    } else {
      window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }

    router.replace(redirectTo);
    router.refresh();
  }

  return (
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
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
            Connexion…
          </>
        ) : (
          "Se connecter"
        )}
      </PrimaryButton>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Heureux de vous revoir"
      subtitle="Connectez-vous pour accéder à votre espace membre."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link
            href="/register"
            className="font-semibold text-choco-600 underline-offset-4 hover:underline"
          >
            Créer mon profil
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
