"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Crown,
  LoaderCircle,
  LockKeyhole,
  Smartphone,
  XCircle,
} from "lucide-react";

/**
 * Parcours de souscription SebPay — Phase 4 (Cameroun, sans écran OTP) :
 * formule → opérateur → numéro → récapitulatif → attente de confirmation sur
 * le téléphone (polling) → résultat.
 *
 * Rendu UNIQUEMENT lorsque le serveur annonce les paiements ouverts.
 * Aucun numéro n'est conservé côté client au-delà de la session du parcours ;
 * aucun secret ne transite ici.
 */

export type PremiumCheckoutPlan = {
  readonly code: string;
  readonly name: string;
  readonly price: string;
  readonly description: string;
};

type PremiumCheckoutProps = {
  plans: readonly PremiumCheckoutPlan[];
};

type Operator = "mtn-cm" | "orange-cm";

type Step = "plan" | "payment" | "waiting" | "success" | "failure";

const OPERATORS: ReadonlyArray<{ value: Operator; label: string }> = [
  { value: "mtn-cm", label: "MTN Mobile Money" },
  { value: "orange-cm", label: "Orange Money" },
];

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 45; // ≈ 3 minutes

const ERROR_MESSAGES: Record<string, string> = {
  payments_closed:
    "Les paiements ne sont pas ouverts pour le moment. Réessaie un peu plus tard.",
  pilot_restricted:
    "Les paiements sont en phase pilote restreinte : seuls les numéros autorisés peuvent payer pour l'instant.",
  premium_already_active:
    "Ton compte bénéficie déjà d'une période Premium active.",
  payment_in_progress:
    "Un paiement est déjà en cours pour ton compte. Patiente quelques minutes avant de réessayer.",
  plan_not_available:
    "Cette formule n'est pas disponible actuellement. Choisis une autre formule.",
  account_not_eligible:
    "Ton compte ne permet pas de souscrire pour le moment. Contacte l'équipe si besoin.",
  provider_unavailable:
    "Le service de paiement est momentanément indisponible. Aucun montant n'a été débité : réessaie dans quelques minutes.",
  invalid_request:
    "Les informations saisies sont incomplètes ou invalides. Vérifie ta sélection et ton numéro.",
  unauthenticated: "Ta session a expiré. Reconnecte-toi puis réessaie.",
  payment_failed:
    "Le paiement n'a pas été confirmé. Aucun accès n'a été activé : tu peux réessayer.",
  status_timeout:
    "La confirmation prend plus de temps que prévu. Si tu as validé le paiement sur ton téléphone, ton accès Premium s'activera automatiquement dès sa confirmation.",
  internal_error:
    "Une erreur inattendue est survenue. Réessaie dans quelques instants.",
};

function errorMessage(code: string | null | undefined): string {
  return ERROR_MESSAGES[code ?? "internal_error"] ?? ERROR_MESSAGES.internal_error;
}

export function PremiumCheckout({ plans }: PremiumCheckoutProps) {
  const [step, setStep] = useState<Step>("plan");
  const [planCode, setPlanCode] = useState<string | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [phoneSuffix, setPhoneSuffix] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const pollAbort = useRef(false);

  useEffect(() => {
    return () => {
      pollAbort.current = true;
    };
  }, []);

  const selectedPlan = plans.find((plan) => plan.code === planCode) ?? null;
  const phoneValid = /^\d{9}$/.test(phoneSuffix);

  const pollTransaction = useCallback(async (transactionId: string) => {
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      if (pollAbort.current) {
        return;
      }

      try {
        const response = await fetch(
          `/api/premium/transactions/${transactionId}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          paymentStatus?: string;
        };

        if (payload.ok && payload.paymentStatus === "succeeded") {
          setStep("success");
          return;
        }

        if (
          payload.ok &&
          (payload.paymentStatus === "failed" ||
            payload.paymentStatus === "cancelled")
        ) {
          setErrorCode("payment_failed");
          setStep("failure");
          return;
        }
      } catch {
        // Erreur réseau passagère : le polling continue.
      }
    }

    if (!pollAbort.current) {
      setErrorCode("status_timeout");
      setStep("failure");
    }
  }, []);

  const submit = useCallback(async () => {
    if (!selectedPlan || !operator || !phoneValid || submitting) {
      return;
    }

    setSubmitting(true);
    setErrorCode(null);

    try {
      const response = await fetch("/api/premium/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          planCode: selectedPlan.code,
          operator,
          payerPhone: `237${phoneSuffix}`,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        code?: string;
        transactionId?: string;
        paymentStatus?: string;
      };

      if (!payload.ok || !payload.transactionId) {
        setErrorCode(payload.code ?? "internal_error");
        setStep("failure");
        return;
      }

      if (payload.paymentStatus === "succeeded") {
        setStep("success");
        return;
      }

      if (payload.paymentStatus === "failed") {
        setErrorCode("payment_failed");
        setStep("failure");
        return;
      }

      setStep("waiting");
      void pollTransaction(payload.transactionId);
    } catch {
      setErrorCode("internal_error");
      setStep("failure");
    } finally {
      setSubmitting(false);
    }
  }, [selectedPlan, operator, phoneValid, phoneSuffix, submitting, pollTransaction]);

  const restart = useCallback(() => {
    setStep("plan");
    setErrorCode(null);
    setPhoneSuffix("");
  }, []);

  return (
    <section
      id="souscription-premium"
      className="scroll-mt-36 rounded-3xl border border-champagne-500/30 bg-cream-50/70 p-6 shadow-card sm:p-8"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-champagne-700">
        Souscription
      </p>

      <h2 className="mt-2 font-serif text-3xl font-semibold text-choco-800">
        Activer Premium avec Mobile Money
      </h2>

      <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-700/65">
        Paiement sécurisé via SebPay. Tu confirmes le paiement directement sur
        ton téléphone : aucun code n&apos;est saisi sur KASSALAFAM et ton
        numéro n&apos;est pas conservé.
      </p>

      {step === "plan" && (
        <div className="mt-7">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => {
              const selected = plan.code === planCode;

              return (
                <button
                  key={plan.code}
                  type="button"
                  onClick={() => setPlanCode(plan.code)}
                  aria-pressed={selected}
                  className={`rounded-3xl border p-5 text-left transition-colors ${
                    selected
                      ? "border-champagne-500 bg-champagne-300/15"
                      : "border-champagne-500/30 bg-cream-50 hover:bg-champagne-300/8"
                  }`}
                >
                  <Crown size={18} className="text-champagne-700" />
                  <span className="mt-3 block font-serif text-xl font-semibold text-choco-800">
                    {plan.name}
                  </span>
                  <span className="mt-1 block text-sm text-ink-700/62">
                    {plan.description}
                  </span>
                  <span className="mt-3 block text-lg font-semibold text-champagne-700">
                    {plan.price}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={!selectedPlan}
            onClick={() => setStep("payment")}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-champagne-500 to-champagne-300 px-6 py-3 text-sm font-bold text-choco-900 transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continuer
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {step === "payment" && selectedPlan && (
        <div className="mt-7 max-w-xl">
          <p className="text-sm font-semibold text-choco-800">
            Formule choisie : {selectedPlan.name} — {selectedPlan.price}
          </p>

          <fieldset className="mt-5">
            <legend className="text-sm font-semibold text-choco-800">
              Opérateur Mobile Money
            </legend>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {OPERATORS.map((item) => {
                const selected = operator === item.value;

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setOperator(item.value)}
                    aria-pressed={selected}
                    className={`flex items-center gap-3 rounded-2xl border p-4 text-left text-sm font-semibold transition-colors ${
                      selected
                        ? "border-champagne-500 bg-champagne-300/15 text-choco-800"
                        : "border-champagne-500/30 bg-cream-50 text-choco-700 hover:bg-champagne-300/8"
                    }`}
                  >
                    <Smartphone size={18} className="text-champagne-700" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label
            htmlFor="premium-payer-phone"
            className="mt-6 block text-sm font-semibold text-choco-800"
          >
            Numéro Mobile Money (Cameroun)
          </label>

          <div className="mt-2 flex items-center overflow-hidden rounded-2xl border border-champagne-500/35 bg-cream-50 focus-within:border-champagne-500">
            <span className="border-r border-champagne-500/25 bg-champagne-300/10 px-4 py-3 text-sm font-semibold text-choco-700">
              +237
            </span>
            <input
              id="premium-payer-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              maxLength={9}
              placeholder="6XXXXXXXX"
              value={phoneSuffix}
              onChange={(event) =>
                setPhoneSuffix(event.target.value.replace(/\D/g, "").slice(0, 9))
              }
              className="w-full bg-transparent px-4 py-3 text-sm text-choco-800 outline-none placeholder:text-ink-700/35"
            />
          </div>

          <p className="mt-2 text-xs leading-5 text-ink-700/55">
            Le numéro qui validera le paiement sur son téléphone. Utilisé
            uniquement pour cette collecte, jamais conservé.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setStep("plan")}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-champagne-500/40 px-6 py-3 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-300/10"
            >
              <ArrowLeft size={16} />
              Retour
            </button>

            <button
              type="button"
              disabled={!operator || !phoneValid || submitting}
              onClick={() => void submit()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-champagne-500 to-champagne-300 px-6 py-3 text-sm font-bold text-choco-900 transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <LockKeyhole size={16} />
              )}
              Payer {selectedPlan.price}
            </button>
          </div>
        </div>
      )}

      {step === "waiting" && (
        <div className="mt-7 flex max-w-xl flex-col items-start gap-4 rounded-3xl border border-champagne-500/30 bg-champagne-300/10 p-6">
          <LoaderCircle size={28} className="animate-spin text-champagne-700" />

          <p className="font-serif text-xl font-semibold text-choco-800">
            Confirme le paiement sur ton téléphone
          </p>

          <p className="text-sm leading-6 text-ink-700/68">
            Une demande de paiement vient d&apos;être envoyée à ton numéro.
            Compose la validation demandée par ton opérateur (MTN ou Orange)
            pour confirmer. Cette page se mettra à jour automatiquement.
          </p>
        </div>
      )}

      {step === "success" && (
        <div className="mt-7 flex max-w-xl flex-col items-start gap-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
          <CheckCircle2 size={28} className="text-emerald-700" />

          <p className="font-serif text-xl font-semibold text-emerald-900">
            Paiement confirmé — Premium activé
          </p>

          <p className="text-sm leading-6 text-emerald-900/75">
            Ton accès Premium est actif. Merci pour ta confiance, et bonne
            recherche sur KASSALAFAM.
          </p>
        </div>
      )}

      {step === "failure" && (
        <div className="mt-7 flex max-w-xl flex-col items-start gap-4 rounded-3xl border border-red-200 bg-red-50 p-6">
          <XCircle size={28} className="text-red-700" />

          <p className="font-serif text-xl font-semibold text-red-900">
            Paiement non confirmé
          </p>

          <p className="text-sm leading-6 text-red-900/75">
            {errorMessage(errorCode)}
          </p>

          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center gap-2 rounded-full border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-800 transition-colors hover:bg-red-100"
          >
            Recommencer
          </button>
        </div>
      )}
    </section>
  );
}
