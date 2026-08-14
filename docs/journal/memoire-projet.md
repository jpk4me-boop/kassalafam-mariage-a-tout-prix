# KASSALAFAM — MARIAGE À TOUT PRIX — Mémoire projet

> Document de référence à coller dans les **instructions du projet** Claude.
> Version du 14/08/2026 — rév. 50. Deux sources : audit factuel du
> dépôt (clone Git public + code + migrations) et connecteurs Supabase / Vercel.
> **Règle de préséance : en cas de contradiction, Git et les migrations font foi.**
>
> **Rév. 50 — 14/08/2026.** `main` = **`1b46aac`** (PR #137, banc pgTAP :
> fixtures WhatsApp). Aucune migration, aucun code applicatif : **rien à
> déployer**, la production reste sur `450ec6c` / `dpl_4j61WK…`. Banc pgTAP
> rejoué sur le VPS : **26 vertes / 8 en échec** (voir §7.0). Recoupé le 14/08 :
> production Vercel inchangée depuis le 12/08 à 12 h 50 UTC, **65 migrations**
> au registre Supabase, registre aligné. **SebPay toujours bloqué chez le
> fournisseur.**
>
> **Rév. 49 — état recoupé Git + Vercel + Supabase le 12/08 à 22 h UTC.**
> `main` = **`450ec6c`** (PR #136), production READY sur ce même commit.
> **PR #134, #135 et #136 sont TOUTES mergées** (la rév. 48 les annonçait
> encore ouvertes ou à créer). **65 migrations appliquées**, registre aligné.
> **Aucune branche non mergée sur `origin`. Aucun déploiement depuis 12 h 50.**
> **Le prochain gros lot, LOT C, est BLOQUÉ par un tiers** : l'API SebPay
> refuse le compte en 403. Voir la fiche `claude/fiche-lot-c-sebpay.md`, qui
> fait foi sur ce sujet.

---

## 0. 🔴 INCIDENT 12/08 — enregistrement de profil impossible (RÉPARÉ, LIVRÉ)

**Symptôme** : `POST /rest/v1/profiles` → **403**, journal PostgreSQL
`permission denied for function text_has_contact_details`. Tout enregistrement
de profil échouait, /profile ET onboarding, pour **tous les membres**, depuis le
06/08. Les écritures `service_role` passant toujours, la panne était invisible
côté administration : 1 seule écriture sur `profiles` entre le 07 et le 11/08.

**Cause** : la migration `20260806073500` a rendu `text_has_contact_details`
interne (EXECUTE révoqué à `authenticated`) tout en laissant son appelant, le
trigger `profiles_reject_contact_details`, en **SECURITY INVOKER**. Le trigger
s'exécutait sous l'identité du membre, sans droit d'appeler sa fonction d'aide.
**Le droit est vérifié à la PLANIFICATION** : la court-circuitation logique ne
protège de rien, l'erreur tombe même sans champ surveillé modifié.

**Correctif — migration 64** (`20260812053000`, PR #129) : trigger en
`security definer`, fonction d'aide toujours interne. Appliquée à 05:12 UTC,
registre réaligné, re-test : POST **200**.

### Les deux règles qui en sortent

1. **Un appelant SECURITY INVOKER ne peut appeler que ce que le MEMBRE a le
   droit d'appeler.** Rendre une fonction d'aide interne oblige à passer son
   appelant en `security definer` (+ `search_path` fixé, appels qualifiés).
2. **Une suite pgTAP qui ne change jamais de rôle ne voit pas ce bug.** Toute
   garde appuyée sur un objet aux privilèges durcis DOIT être rejouée sous
   `set local role authenticated`.

---

## 0 bis. Lots livrés le 12/08 — TOUS MERGÉS

### LOT E — visite guidée du premier passage (PR #130, migration 65)

Six bulles ancrées sur les vrais boutons du flux de découverte, halo perçant le
voile. Témoin **`profiles.tour_completed_at`** (`20260812060000`) : **une fois
par PERSONNE**, pas par navigateur ; le localStorage n'est qu'un filet
anti-clignotement. L'ancien bandeau « mini-tuto » est supprimé.
« Revoir la visite guidée » dans /profile remet le témoin à NULL.
La bulle « Voir plus » **dit** qu'ouvrir un détail enregistre une visite
visible par l'autre membre. Suite `discover-guided-tour` : **16 tests**.

### LOT F — Explorer (PR #131)

Route **`/explorer`** : un profil à la fois, barre d'actions basse, flèches → et
↓. La grille par univers reste intacte ; entrée en tête du hub /discover.
**Trois décisions à tenir :** la visite reste un geste volontaire (défiler
n'enregistre RIEN) · **pas de retour en arrière** (candidat Premium, Lot C) ·
**aucun écran de rétention** ni compteur d'essais.
Invariant testé : **le deck ne parle jamais à la base** — il réutilise
`CandidateDetailsToggle`, `InterestButton`, `FavoriteButton`. `/explorer` est
ajouté au proxy. Carte d'état `DiscoveryStateCard` partagée. **9 tests**.

### LOT G — atterrissage du nouveau membre (PR #133)

Fin de l'Explorer → « Aller à mon tableau de bord » · **quatre tuiles à chiffres
RÉELS** (`list_my_relationships` pour messages et demandes,
`count_profile_visitors` pour les visiteurs, `member_favorites` pour le sens
sortant) — **une lecture en échec affiche un tiret, jamais zéro** · **conseil du
jour NEUTRE**, sept entrées, stable sur la journée, **rien de religieux** (trois
univers cohabitent ; un test interdit hadith/coran/bible/sourate/verset/Allah/
prière/Dieu — si du contenu confessionnel est voulu, la maille est **par
univers**) · bandeau d'atterrissage limité aux 24 h suivant la visite.
**8 tests.**

### LOT H — menu du profil (PR #133)

État de vérification lisible partout · **« Déflouter / Reflouter mes photos »**
· **« Visites discrètes »** · Mon profil · Partager · **Aide** (/aide) ·
Administration · Déconnexion. Fermeture : Échap, clic extérieur, navigation.
**Écarté de Farata** : « Demandes restantes 5/5 » (aucun quota n'existe),
« Sons activés » (aucune fonction sonore), « Paramètres » séparé.
Garde-fous : aucun interrupteur tant que l'état n'est pas lu, **retour en
arrière si l'écriture échoue**. **7 tests.**

### LOT I — balayage des abonnements échus (PR #135, `c823182`, **MERGÉE**)

`expire_due_premium_subscriptions` existait **sans aucun appelant** : ni cron
Vercel, ni pg_cron (extension absente). Le balayage est branché sur le cron
quotidien `/api/cron/reconcile-sebpay` (04:00 UTC), **avant** toute
considération SebPay — un abonnement accordé à la main doit expirer même
paiements fermés. Échecs cloisonnés dans les deux sens, nombre rendu dans la
réponse JSON. **6 tests.**

### LOT J — observabilité SebPay (PR #136, `450ec6c`, **MERGÉE**)

Le statut HTTP renvoyé par le fournisseur survit désormais à l'erreur
(`providerHttpStatus` journalisé), plafond de réconciliation, page Premium
honnête. **17 tests.** C'est ce lot qui a permis de qualifier le blocage
SebPay en **403** plutôt qu'en 502 opaque.

### PR #134 — correctif du halo (`3e3fdab`, **MERGÉE**)

Deux défauts trouvés par **contrôle visuel en production**, pas par les tests :

1. **Halo plus grand que l'écran** (PR #132, livrée) : la photo d'une carte
   mesure 596 × **1059 px** dans une fenêtre de 855 px. Corrigé : halo borné à
   l'écran et à la moitié de sa hauteur, élément haut amené par le haut, bulle
   dans la plus grande bande libre.
2. **Halo décalé de 302 px** (PR #134) : le halo portait
   `transition-all duration-300` — il poursuivait sa cible avec un temps de
   retard à chaque image du défilement. Corrigé : **transition supprimée** +
   suivi `requestAnimationFrame` jusqu'à immobilisation (3 images, plafond 2 s).

**Reste à faire : le contrôle visuel du halo en production** — le correctif est
livré mais jamais regardé.

**Leçon** : le calcul était juste, le RENDU faux. **Comparer la position
calculée et la position rendue** aurait donné la réponse une heure plus tôt.

---

## 1. Phase 5 SebPay — LOT C, BLOQUÉ chez le fournisseur

**La fiche `claude/fiche-lot-c-sebpay.md` (rév. 4) fait foi.** Résumé :

- Le pilote a été tenté le 12/08. **Échec : l'API live SebPay refuse le compte
  en 403 sur TOUS les endpoints, y compris `GET /countries` en lecture seule.**
- Tout ce qui était vérifiable de notre côté l'a été et est **conforme** :
  clés reconnues (401 sans clé, 403 avec), KYC validé, contrat API respecté
  sur les onze pages de documentation, verrou pilote fonctionnel.
- **Production refermée** depuis 12 h 50 UTC : `SEBPAY_PAYMENTS_ENABLED=false`,
  `/premium` affiche « Bientôt disponible », ce qui est exact.
- **Deux actions en attente** : trancher la question ouverte (l'IP publique
  a-t-elle réellement été déclarée dans le back-office avant le dernier 403 ?),
  puis **envoyer le courriel à contact@sebpay.africa**. Le corps du courriel
  est prêt dans la fiche.

⚠️ **Première occasion de voir le chemin PREMIUM du verrou** (Lot B) : aucun
compte premium n'existe aujourd'hui (**vérifié : `profiles where is_premium`
= 0**). Le pilote devra vérifier /visitors et « Ils vous ont ajouté » côté
déverrouillé, en plus des contrôles de transaction.

### ✅ CORRECTION D'UNE ALERTE ERRONÉE (rév. ≤ 47)

Les révisions précédentes annonçaient : « `discover_candidates` ordonne par
`c.is_premium desc` ; sans remise à false, un ex-premium reste mis en avant
indéfiniment. » **C'est FAUX**, vérifié dans la base le 12/08 :

```
order by public.profile_has_active_premium(c.id) desc, has_photo desc, …
```

Le tri passe par la fonction, qui compare `ends_at` à maintenant. **Aucun
ex-premium n'est mis en avant.** Ne pas « corriger » ce non-bug.

**Ce qui est vrai** : `profiles.is_premium` est un CACHE, jamais l'autorité.
Trois chemins le maintiennent — le trigger
`trg_premium_subscriptions_sync_profile_flag` à chaque changement
d'abonnement ; `get_my_premium_status()` qui appelle
`expire_profile_premium_subscription(uid)` (auto-réparation à la lecture) ; et
désormais le balayage du Lot I. Restait sans eux le membre **dormant** : ligne
`status='active'` périmée et drapeau vrai, visibles en administration et dans
les exports analytiques. **Les gardes, elles, n'ont jamais été concernées** :
`profile_has_active_premium` est temporelle.

### LOT D — ouverture générale

`SEBPAY_PILOT_MODE=false` **uniquement après** succès du pilote.

## 2. Lots A et B — livrés et vérifiés en production

**LOT A** (PR #126) : « Vois qui est en ligne » et « Messages vocaux » en badge
ambre **« Bientôt »** ; le vert `emerald` reste STRICTEMENT réservé au livré.
FAQ « Tous les avantages sont-ils déjà actifs ? ».

**LOT B** (PR #127 SQL, #128 interface, migration 63) :
`profiles.discreet_favorites` · `count_profile_visitors()` et
`count_favorited_by()` **LIBRES** · `list_profile_visitors()` et
`list_favorited_by()` **premium** · `list_favorites()` **GRATUITE**.

**RÈGLE ACTÉE : on gate les signaux ENTRANTS, jamais le contenu SORTANT du
membre.**

**Mécanisme du verrou** : liste gatée et compteur libre appliquent EXACTEMENT
les mêmes prédicats. Liste vide + compteur > 0 ⇒ verrouillé, jamais « aucune
visite ». Gabarits **vides** (`aria-hidden`), pas des profils floutés.

**Vérifié en production le 12/08**, y compris l'état verrouillé sous Yelena
(« 1 personne », cadenas ambre, gabarit vide), recoupé côté serveur sur Yelena
ET Esmeralda (compteur 1 / liste 0 ligne / premium false).

### ⚠️ ALERTE DE CONCEPTION — messages vocaux

`report_message` conserve un **instantané TEXTE**. Un message **audio** ne peut
être ni scanné ni relu ainsi : harcèlement et contenu déplacé deviendraient très
difficiles à modérer, sur une plateforme à **3 femmes pour 9 hommes** dont la
sécurité est la promesse centrale. **Reporter les vocaux** tant qu'il n'y a pas
de réponse de modération.

## 3. Identité du projet

kassalafam.com · Vercel `prj_fRS0ZOIwxluh4QcClK7018l1Fxmg` /
team `team_l4mNQ2RUREa3JWjijOdVJI3X` · Supabase `cmifejrcnvixwbxhzdpx` ·
GitHub `jpk4me-boop` (PUBLIC) · WhatsApp `+237672482763` (= numéro pilote MTN).

⚠️ **TROIS homonymes** — dépôt de travail :
`C:\Users\USER\Projects\kassalafam-mariage-a-tout-prix`. `CLAUDE.md` fait foi.

**VPS Hostinger `srv1384501`** : poste de contrôle SQL (PostgreSQL 16 + pgTAP).
**Docker Desktop n'existe pas sur le poste Windows.**

⚠️ **Next.js 16 : le middleware s'appelle `src/proxy.ts`.** Les préfixes
protégés vivent dans `src/lib/supabase/middleware.ts` (`PROTECTED_PREFIXES` +
`MEMBER_APP_PREFIXES`) — toute nouvelle route membre doit y être ajoutée.

⚠️ **Deux crons Vercel** (`vercel.json`, vérifié) : `purge-analytics` à
`30 3 * * *` et `reconcile-sebpay` à `0 4 * * *`, tous deux protégés par
`CRON_SECRET`.

## 4. Stack réelle

Next.js 16.2.9 · React 19.2.4 · TS ^5 · Tailwind ^4 · Supabase · npm ·
Turbopack · sharp ^0.34.5. Windows : npm depuis le chemin en MAJUSCULES.

## 5. État Git, Vercel et base — VÉRIFIÉ le 12/08 à 22 h UTC

- HEAD `origin/main` = **`450ec6c`** (merge PR #136).
- **Production Vercel** : `450ec6c` READY, `dpl_4j61WKLpaWZbe5dJNDKiiQwgxHRX`,
  créé à **12 h 50 min 37 UTC** — c'est le redéploiement de repli qui a refermé
  les paiements. **Aucun déploiement depuis.**
- **65 migrations** dans le dépôt, **65 dans le registre Supabase**, dernière
  `20260812060000`. **Registre aligné.**
- **43 suites `test:*`** Node (et non 42).
- **34 fichiers pgTAP** dans `supabase/tests` (et non 35) ; **toutes jouées le
  14/08 sur le VPS : 26 vertes, 8 en échec.**
- **Aucune branche non mergée sur `origin`** ; **22 branches déjà mergées**
  restent à supprimer (et non 18).

### Livraisons

| PR | Objet | Commit |
|---|---|---|
| #92–#125 | Voir rév. 43 | — |
| #126 | Lot A — avantages non livrés en « Bientôt » | `5c5f8ed` |
| #127 | Lot B1 — migration 63 + pgTAP | `63133c5` |
| #128 | Lot B2 — état verrouillé, favoris entrants | `a69ae4c` |
| #129 | Migration 64 — privilèges du garde-fou coordonnées | `28f109f` |
| #130 | Lot E — visite guidée + migration 65 | `2b2a1b8` |
| #131 | Lot F — Explorer | `42f8ac2` |
| #132 | Correctif halo — bornage à l'écran | `5f70f66` |
| #133 | Lots G et H — atterrissage + menu du profil | `2c2aed2` |
| #134 | **Correctif halo — punaisé sur son ancre** | `3e3fdab` |
| #135 | **Lot I — balayage des abonnements échus** | `c823182` |
| #136 | **Lot J — observabilité SebPay** | `450ec6c` |
| #137 | **Banc pgTAP — fixtures WhatsApp des 4 suites d'onboarding** | `1b46aac` |

Catalogue premium : 2 500 / 6 000 / 10 000 XAF (`premium_1_mois` =
`2d8a0923-896b-4016-b770-372fa0429e4d`).

## 6. Parcours membre — état réel

Onboarding → **visite guidée** (une fois par personne) → **Explorer** ou grille
par univers → fin de parcours → **tableau de bord** (aperçu, 4 tuiles, conseil
du jour, sélection, guide, visibilité, prochaines étapes) · en-tête avec **menu
du profil** portant deux réglages de confidentialité.

## 7. Points ouverts

- **7.0 Dette pgTAP** : **26 vertes / 8 en échec** (banc rejoué sur le VPS le
  14/08, `main` = `1b46aac`). Les 4 suites d'onboarding sont réparées (PR #137 :
  colonne `whatsapp_phone` dans les fonctions d'amorce). Les suites des
  migrations 64 et 65 sont jouées et VERTES. **Restent 8, dont 4 fausses
  rouges** : les suites d'INVENTAIRE (`guard_profile_identity_fields` T14,
  `harden_sensitive_table_grants` A15–A17,
  `harden_future_public_default_privileges` A4/B1/B2,
  `create_candidate_showcase_backend` T27) ne se valident qu'en base réelle —
  **ne pas les « corriger » dans le banc, ce serait truquer le thermomètre.**
  **4 dettes réelles** : le gabarit `safety_report_actions` et ses marqueurs
  `<ADMIN_UUID>` (jamais exécutable), plus 3 suites à trancher par lecture de
  code (`account_moderation_backend`, `guard_premium_flag`,
  `premium_authoritative_foundation`). **Aucune ne touche un chemin membre.**
  Cette dette a déjà coûté 6 jours de panne. Fiche dédiée :
  `docs/journal/fiche-banc-pgtap.md`.
- **7.1 Acquisition** : 5 comptes de test (`is_test_account`) — toujours
  filtrer ; **19 profils** (vérifié), 13 réels, 4 finalisés, 3 F / 9 H.
- **7.2 Contrôles visuels — SOLDÉS pour A, B, E, G, H.** Restent :
  l'**Explorer sur un vrai téléphone** (barre collante) et le **halo après
  #134**. **Rappel** : seules Yelena (`jeanpierrekenne510@gmail.com`) et
  Esmeralda (`bryant2tiwa@gmail.com`) ont des compteurs > 0.
  ⚠️ **Vérifié le 12/08 : `tour_completed_at` est NULL sur les 19 profils** —
  la visite guidée n'a encore été terminée par personne. **N'importe quel
  compte peut donc servir de cobaye**, pas seulement Yacynthe.
- **7.3 SebPay — BLOQUÉ chez le fournisseur** (403 sur toute l'API live).
  L'exemption d'allowlist est obtenue ; elle n'a pas suffi. Voir §1 et la fiche.
- **7.4 WhatsApp** : assisté seul, SIM dédiée, 4 garde-fous, fiche dédiée.
- **7.5** : **22 branches mergées à nettoyer** sur `origin` · clone imbriqué à
  supprimer sur le VPS · index de session Claude Code → `450ec6c`.

## 8. Backlog candidat — ordre recommandé

1. **SebPay : trancher la question ouverte de la fiche, puis ENVOYER le
   courriel.** C'est la seule action qui débloque le Lot C, et elle a un délai
   de réponse externe : elle doit partir en premier.
2. ~~Jouer les suites pgTAP 64 et 65~~ — **FAIT** (13/08, vertes). ~~Réparer les
   4 fixtures WhatsApp~~ — **FAIT** (14/08, PR #137). Suite du banc : trancher
   les 3 suites de comportement du §2 D de la fiche.
3. **Contrôle visuel du halo en production** (#134 livrée, jamais regardée) et
   **Explorer sur un vrai téléphone**.
4. Ménage : 22 branches mergées sur `origin`, clone imbriqué du VPS.
5. **Lot C → Lot D** (SebPay), dès que le 403 tombe.
6. Explorer, suites possibles : filtres (exigerait d'étendre
   `discover_candidates` — migration), retour en arrière **premium**, vue
   grille premium. Rien ne se vend avant que les paiements fonctionnent.
7. **Construire ou renoncer** : « Vois qui est en ligne » et « Messages
   vocaux ». Le jour où l'un est livré : badge vert + adapter les 8 tests de
   `premium-page-uplift`.
8. Dette pgTAP : les 13 suites en échec, puis pgTAP des migrations 57–59.
9. « Gérer mon compte » self-serve · manifest Android · unicité pseudo ·
   Push PWA · WhatsApp automatique · coach IA (non prioritaire).

## 9. Méthode de travail

PowerShell = poste de contrôle, `cd` d'abord · **JAMAIS d'espace réservé `<…>`**
dans un bloc PowerShell ni dans un fichier de test · RÈGLE D'HONNÊTETÉ
verrouillée par tests · livraisons CRLF, Git stocke LF · circuit Git rodé 17/17.

### ⚠️ ORDRE DE DÉPLOIEMENT

**Migration AVANT merge** quand un lot touche la base ET l'interface. Cas vécu :
`/profile` s'est mis à écrire `discreet_favorites` sans la colonne → toute
sauvegarde échouait. Un champ ajouté à un upsert est un couplage dur à la base.

Cas particulier : un correctif **purement base** qui restaure un comportement
déjà attendu par le code en production s'applique **seul et tout de suite** ;
la PR suit (migration 64).

**Réaligner le registre après tout `apply_migration` par connecteur** — piège
survenu **cinq fois** (dernière : `20260812055703` → `20260812060000`).

### ⚠️ PIÈGE GIT — `package.json` partagé entre deux lots

Deux lots en attente touchent souvent `package.json` (une ligne de test
chacun) : `git checkout main` est refusé tant que le lot précédent n'est pas
mergé, et une ligne de test peut partir **sans** son fichier. **Merger le lot
précédent AVANT de revenir sur `main`** et vérifier que le `git add` couvre le
fichier référencé.

### Vérifier une RPC sous l'identité d'un membre, sans se connecter

```sql
begin;
select set_config('request.jwt.claims',
  '{"sub":"<uuid du membre>","role":"authenticated"}', true);
select public.count_profile_visitors(),
       (select count(*) from public.list_profile_visitors());
rollback;
```

**`set_config(…, true)` est TRANSACTIONNEL.**

### Lire le dépôt sans le poste

Le dépôt étant public, un `git clone --depth 1` dans le bac à sable permet de
grepper tout le code (utile quand le pont vers le poste est coupé). Les
connecteurs Supabase et Vercel donnent l'état réel de la base et des
déploiements. **Ce triptyque suffit à établir un état complet sans le poste :
il a servi à produire cette rév. 49.**

### Banc d'essai pgTAP sans Docker (livré en #127)

`scripts/pgtap/bootstrap-supabase-shim.sql` reconstitue rôles, `auth.users`,
`auth.uid()`, `storage.*`. `scripts/pgtap/run-pgtap.sh` crée une base jetable,
rejoue les migrations, exécute les suites. Cloner dans **`/tmp`** sur le VPS,
jamais dans un clone existant. `.gitattributes` : `*.sh text eol=lf`.

### Leçons de méthode (12/08)

- **Le pont écrit directement dans le dépôt**, puis point d'arrêt sur
  `git status --short`.
- **Annoncer le nombre de tests attendu ET la forme du statut** (`M` ou `??`).
- **Un contrôle visuel se prépare EN BASE** : vérifier quel compte peut
  produire l'état attendu.
- **Un contrôle visuel qui échoue vaut de l'or** : un clic sur « Enregistrer
  mon profil » a révélé 6 jours de panne.
- **Comparer le CALCULÉ et le RENDU** (leçon du halo).
- **Vérifier une alerte avant de la traiter** : celle sur `discover_candidates`
  traînait depuis des révisions et était fausse (§1).
- **Une mémoire écrite le matin est périmée le soir.** La rév. 48 annonçait
  #134 ouverte et #135 à créer : les trois PR étaient mergées. **Rouvrir une
  session par l'audit Git + Vercel + Supabase, jamais par la mémoire.**
- **Vérifier le répertoire des DEUX côtés du pont.** L'homonyme
  `C:\Users\USER\kassalafam-mariage-a-tout-prix` est un vieux clone du MÊME
  dépôt GitHub (HEAD `2d5178b`, sans `supabase/`, arbre propre) et contient un
  dossier `.claude` : **Claude Code y retourne de lui-même, et un `cd` en
  PowerShell ne le suit pas.** Première question à toute session Claude Code :
  « quel est ton répertoire de travail courant ? ». Vécu deux fois le 14/08.
- **Le banc pgTAP ne se lance pas sous `root`** : `sudo -u postgres bash
  scripts/pgtap/run-pgtap.sh` (auth `peer` sur la socket), `chmod -R a+rX` sur
  le clone jetable, et `bash` obligatoire car le script est en mode `100644`.
- **Le pilotage du navigateur ne voit QUE son propre profil Chrome.**
- **Build cloud hors ligne** : Turbopack échoue sur Google Fonts ; repli
  `next build --webpack`. Le build du poste fait foi.
- **Garde `guard_profiles_admin_fields`** : bloque `is_premium` à
  `pg_trigger_depth() <= 1` et toute écriture administrative sous session
  membre.

## 10. Projet connexe

**Cercle des Titans** — travail SebPay NON COMMITÉ à mettre à l'abri (fonctions
+ migration `20260810223708…`) · branche parasite `feat/contact-exchange-ui` à
supprimer · « S'inscrire »/« Se connecter » demandé · Draft PR SebPay `aef969a`
à vérifier. ⚠️ **L'exemption SebPay ne couvre QUE kassalafam.com.**
