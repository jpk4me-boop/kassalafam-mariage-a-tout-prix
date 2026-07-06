/**
 * Allowlists d'administration — SERVEUR UNIQUEMENT (L3-B / back-office central).
 *
 * Aucun rôle n'est stocké en base : l'identité admin est définie par des
 * variables d'environnement serveur (UUID `auth.users` séparés par des virgules).
 * Elles ne sont JAMAIS préfixées `NEXT_PUBLIC_`, donc jamais exposées au
 * navigateur.
 *
 *   ADMIN_USER_IDS        → administrateurs (modération courante)
 *   SUPER_ADMIN_USER_IDS  → super administrateurs (actions sensibles)
 *
 * Règle hiérarchique : tout super administrateur EST aussi administrateur.
 * `isAdminUserId` renvoie donc `true` pour les membres des deux listes.
 *
 * Ces fonctions sont pures (lecture d'env). Toute vérification doit se faire
 * côté serveur uniquement (Server Component / Route Handler / Server Action),
 * jamais dans un composant "use client". Voir `admin-guard.ts` pour les gardes
 * de plus haut niveau (requireAdmin / requireSuperAdmin).
 */

function parseUserIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getAdminUserIds(): string[] {
  return parseUserIds(process.env.ADMIN_USER_IDS);
}

export function getSuperAdminUserIds(): string[] {
  return parseUserIds(process.env.SUPER_ADMIN_USER_IDS);
}

/**
 * `true` si l'utilisateur est super administrateur (liste stricte
 * SUPER_ADMIN_USER_IDS).
 */
export function isSuperAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return getSuperAdminUserIds().includes(userId);
}

/**
 * `true` si l'utilisateur est administrateur. Inclut TOUJOURS les super
 * administrateurs (hiérarchie : super_admin ⊇ admin), même si leur UUID n'est
 * pas dupliqué dans ADMIN_USER_IDS.
 */
export function isAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return getAdminUserIds().includes(userId) || isSuperAdminUserId(userId);
}
