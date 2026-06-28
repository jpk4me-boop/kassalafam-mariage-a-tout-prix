/**
 * Allowlist des administrateurs — SERVEUR UNIQUEMENT (L3-B).
 *
 * Aucun rôle n'existe en base : l'identité admin est définie par la variable
 * d'environnement serveur `ADMIN_USER_IDS` (UUID `auth.users` séparés par des
 * virgules). Elle n'est jamais préfixée `NEXT_PUBLIC_`, donc jamais exposée au
 * navigateur. Toute vérification admin doit se faire côté serveur uniquement
 * (Server Component / Route Handler), jamais dans un composant "use client".
 */
export function getAdminUserIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return getAdminUserIds().includes(userId);
}
