import "server-only";

import type { Gender } from "@/lib/types/database";

export const IDENTITY_REASON_MIN = 10;
export const IDENTITY_REASON_MAX = 2_000;

export type IdentityCorrectionActionState =
  | { ok: true; message: string }
  | { ok: false; error: string; code?: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIdentityUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isIdentityGender(
  value: string | null,
): value is Gender | null {
  return value === null || value === "homme" || value === "femme";
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function adultCutoffIsoDate(): string {
  const now = new Date();
  const cutoff = new Date(
    Date.UTC(
      now.getUTCFullYear() - 18,
      now.getUTCMonth(),
      now.getUTCDate(),
    ),
  );

  return cutoff.toISOString().slice(0, 10);
}

export function mapIdentityCorrectionError(message: string): {
  message: string;
  code?: string;
} {
  const mappings: Array<[string, string]> = [
    ["PROFILE_NOT_FOUND", "Ce membre n’existe plus."],
    ["ACTOR_NOT_FOUND", "Votre session administrateur est invalide."],
    [
      "SELF_IDENTITY_CORRECTION_FORBIDDEN",
      "Vous ne pouvez pas corriger les champs d’identité de votre propre compte.",
    ],
    [
      "IDENTITY_CORRECTION_REASON_REQUIRED",
      "Un motif de correction est obligatoire.",
    ],
    [
      "IDENTITY_CORRECTION_REASON_LENGTH_INVALID",
      "Le motif doit contenir entre 10 et 2 000 caractères.",
    ],
    ["INVALID_GENDER", "Le genre demandé est invalide."],
    [
      "PROFILE_MINIMUM_AGE_REQUIRED",
      "La date de naissance doit correspondre à un âge d’au moins 18 ans.",
    ],
    [
      "IDENTITY_CORRECTION_NO_CHANGE",
      "Aucune valeur d’identité n’a été modifiée.",
    ],
    [
      "PROFILE_IDENTITY_CORRECTION_CONTEXT_REQUIRED",
      "Le contexte sécurisé de correction est absent.",
    ],
  ];

  for (const [code, userMessage] of mappings) {
    if (message.includes(code)) {
      return { message: userMessage, code };
    }
  }

  return {
    message: "La correction d’identité est impossible pour le moment.",
  };
}