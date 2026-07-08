"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormError, Label, PrimaryButton } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";

/**
 * Définition d'un nouveau mot de passe après clic sur le lien de
 * réinitialisation reçu par email.
 *
 * Accès : la page n'est exploitable qu'avec une SESSION DE RÉCUPÉRATION valide.
 * Flux PKCE (défaut @supabase/ssr) : le lien revient sur `/reset-password?code=…`
 * et le client navigateur (`detectSessionInUrl`, MÊME mécanisme que la
 * confirmation d'inscription — aucune route de callback concurrente introduite)
 * échange automatiquement ce `code` contre une session, puis émet un évènement
 * d'auth (`PASSWORD_RECOVERY` et/ou `SIGNED_IN`). On accepte donc l'un OU la
 * simple présence d'une session (on ne suppose pas que `PASSWORD_RECOVERY`
 * suffira). Sans session valide (lien expiré, absent, déjà consommé, ou ouvert
 * dans un autre navigateur que celui de la demande), on invite à redemander un
 * lien. Le formulaire n'est JAMAIS rendu tant que la session n'est pas confirmée.
 *
 * Sécurité : le mot de passe n'est jamais journalisé ni stocké ; l'écriture
 * passe uniquement par `supabase.auth.updateUser`. Après succès, la session de
 * récupération est fermée (`signOut`) pour forcer une reconnexion propre.
 */

const MIN_PASSWORD_LENGTH = 8;

type Phase = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Détection de la session de récupération. On écoute `PASSWORD_RECOVERY`
  // (émis par `detectSessionInUrl`) et on accepte aussi une session déjà
  // présente (rechargement après consommation du jeton). Un jeton en erreur
  // dans l'URL (ex. `error_code=otp_expired`) ou l'absence de session au bout
  // d'un court délai basculent en état « lien invalide ».
  useEffect(() => {
    const supabase = createClient();
    let resolved = false;

    const search = typeof window !== "undefined" ? window.location.search : "";
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    // Erreur explicite renvoyée par Supabase (ex. `error_code=otp_expired`),
    // en query OU en hash selon le flux → lien invalide.
    const hasUrlError = /error/i.test(search) || /error/i.test(hash);
    // Un `code` PKCE (query) ou des jetons (hash) doivent être échangés par
    // `detectSessionInUrl` : ce round-trip réseau justifie une fenêtre d'attente
    // plus large avant de conclure à un lien invalide.
    const hasExchangeable =
      /[?&]code=/.test(search) || /access_token=/.test(hash);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        !hasUrlError &&
        (event === "PASSWORD_RECOVERY" ||
          (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")))
      ) {
        resolved = true;
        setPhase("ready");
      }
    });

    // Repli (setState uniquement dans ce callback, jamais dans le corps de
    // l'effet) : sans session établie, on bascule en « lien invalide » plutôt
    // que de rester en attente. Immédiat si erreur explicite ; fenêtre large si
    // un code doit être échangé ; courte pour une visite directe sans lien.
    const graceMs = hasUrlError ? 0 : hasExchangeable ? 6000 : 2000;
    const timer = setTimeout(() => {
      if (!resolved) setPhase((p) => (p === "checking" ? "invalid" : p));
    }, graceMs);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`,
      );
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setLoading(false);
      setError(
        updateError.message.toLowerCase().includes("different")
          ? "Choisissez un mot de passe différent de l'ancien."
          : "Le lien de réinitialisation a peut-être expiré. Redemandez-en un.",
      );
      return;
    }

    // Session de récupération fermée : l'utilisateur se reconnecte avec le
    // nouveau mot de passe. On atterrit alors proprement sur /login (route
    // d'auth, non redirigée puisque plus aucune session active).
    await supabase.auth.signOut();
    router.replace("/login?reset=1");
    router.refresh();
  }

  if (phase === "checking") {
    return (
      <AuthShell
        title="Réinitialisation en cours"
        subtitle="Vérification de votre lien…"
        footer={
          <Link
            href="/login"
            className="font-semibold text-choco-600 underline-offset-4 hover:underline"
          >
            Retour à la connexion
          </Link>
        }
      >
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-ink-700/60">
          <Loader2 size={18} className="animate-spin" />
          Un instant…
        </div>
      </AuthShell>
    );
  }

  if (phase === "invalid") {
    return (
      <AuthShell
        title="Lien invalide ou expiré"
        subtitle="Ce lien de réinitialisation n'est plus valable."
        footer={
          <Link
            href="/login"
            className="font-semibold text-choco-600 underline-offset-4 hover:underline"
          >
            Retour à la connexion
          </Link>
        }
      >
        <div className="flex flex-col gap-4">
          <FormError message="Le lien a expiré ou a déjà été utilisé. Demandez un nouveau lien de réinitialisation." />
          <Link
            href="/forgot-password"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-6 py-3 text-sm font-semibold text-cream-50 shadow-[0_14px_34px_-14px_rgba(43,26,18,0.85)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-400/50"
          >
            Demander un nouveau lien
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Nouveau mot de passe"
      subtitle="Choisissez un mot de passe pour sécuriser votre compte."
      footer={
        <Link
          href="/login"
          className="font-semibold text-choco-600 underline-offset-4 hover:underline"
        >
          Retour à la connexion
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error ? <FormError message={error} /> : null}

        <div>
          <Label htmlFor="password">Nouveau mot de passe</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            placeholder="8 caractères minimum"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

        <PrimaryButton type="submit" disabled={loading} className="mt-2">
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Enregistrement…
            </>
          ) : (
            "Réinitialiser mon mot de passe"
          )}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
