# Banc d'essai pgTAP — état de référence

> Établi le **13/08/2026** en exécutant réellement `scripts/pgtap/run-pgtap.sh`
> sur `main` = `450ec6c`, 65 migrations rejouées sur base jetable. Cette fiche
> fait foi sur l'état du banc. **Aucune donnée de production n'a été touchée.**
>
> **Rév. 2 — 14/08/2026. Banc rejoué sur le VPS `srv1384501`, `main` =
> `1b46aac` (PR #137).** Les quatre suites du §2 B sont RÉPARÉES. Bilan :
> **26 vertes / 8 en échec** (contre 22 / 12 la veille).

## 0. Le verdict

| | |
|---|---|
| Suites au dépôt | **34** |
| **Vertes** | **26** |
| **En échec** | **8** |
| Migrations rejouées | 65, **aucune erreur** |

Relevé du **14/08/2026** sur `main` = `1b46aac`. Les quatre suites d'onboarding
du §2 B ont été réparées par la **PR #137** : `1..40`, `1..22`, `1..48`,
`1..18`, **zéro `not ok`**, plan annoncé = assertions réellement exécutées dans
les quatre cas. Les **8 restantes sont un sous-ensemble strict des 12** du
13/08 : aucune suite verte n'est passée au rouge.

**Les deux suites qui n'avaient jamais été jouées sont VERTES**, assertion par
assertion — 6 sur 6 pour la migration 64, 7 sur 7 pour la 65. Détail au §1.

**Aucune des suites en échec n'est une régression des migrations 64 ou 65** —
démontré par comparaison, §3. Triage au §2.

## 1. ✅ Les suites 64 et 65 — jouées, vertes

### Migration 64 — `20260812053000_fix_contact_details_guard_privileges` (6/6)

```
ok 1 - le trigger est SECURITY DEFINER — sinon un membre ne peut pas appeler
       la fonction d'aide et TOUTE écriture de profil échoue
ok 2 - la fonction d'aide reste INTERNE : le correctif ne rend aucun privilège
       au rôle authenticated
ok 3 - un membre peut écrire une colonne NON surveillée — c'est exactement ce
       qui échouait : le droit sur la fonction est vérifié à la planification,
       la court-circuitation logique ne protège de rien
ok 4 - un membre peut enregistrer une biographie honnête
ok 5 - la garde REFUSE toujours un numéro sous identité de membre — le
       correctif de privilèges n'ouvre aucune brèche
ok 6 - la garde refuse aussi sous rôle privilégié : comportement inchangé
```

### Migration 65 — `20260812060000_add_profile_tour_completed_at` (7/7)

```
ok 1 - la colonne tour_completed_at existe
ok 2 - le témoin est une date complète, pas un booléen : on saura QUAND
ok 3 - la colonne est NULLABLE — NULL signifie « visite à jouer »
ok 4 - un profil créé sans mention part à NULL : il verra la visite une fois
ok 5 - le membre pose lui-même son témoin — aucune garde ne le refuse
ok 6 - le membre peut le remettre à NULL : c'est « Revoir la visite guidée »
ok 7 - le membre ne touche JAMAIS le témoin d'un autre : la RLS ne laisse
       passer aucune ligne
```

Les deux suites appliquent bien la règle tirée de l'incident : elles rejouent le
chemin **sous `set local role authenticated`**, via un helper qui rend toujours
le rôle, erreur comprise.

⚠️ Le script juge « vert » à l'absence de `not ok` et d'`ERROR:`. Une suite qui
avorterait avant son premier test passerait donc pour verte. Les deux suites
ci-dessus ont été **relues en sortie TAP brute** : le plan annoncé (`1..6`,
`1..7`) correspond au nombre d'assertions réellement exécutées. Sur toute
nouvelle suite, refaire cette vérification une fois.

## 2. 🔴 Triage des suites en échec

### A. Suite jamais complétée — 1

| Suite | Constat |
|---|---|
| `20260704000000_safety_report_actions` | `ERROR: invalid input syntax for type uuid: "<ADMIN_UUID>"` — le gabarit contient encore ses **marqueurs de remplacement**. La suite n'a jamais pu s'exécuter, ni ici ni ailleurs. À compléter ou à retirer : en l'état elle ne teste rien. |

### B. ✅ Fixtures périmées — RÉPARÉES le 14/08 (PR #137)

`ONBOARDING_INCOMPLETE_WHATSAPP` tombe **avant** l'assertion visée : le numéro
WhatsApp est devenu obligatoire (migrations `20260802090000` et
`20260803230000`), et la RPC de finalisation le contrôle en amont. Les fixtures,
écrites avant, ne le renseignent pas. **La garde testée n'est jamais atteinte.**

| Suite | Attendu | Obtenu |
|---|---|---|
| `20260708130000_add_onboarding_completion` | `ONBOARDING_INCOMPLETE_MARITAL_STATUS` | `…_WHATSAPP` |
| `20260715090000_add_profile_religion` | `ONBOARDING_INCOMPLETE_RELIGION` | `…_WHATSAPP` |
| `20260715150000_add_profile_origin_city` | `ONBOARDING_INCOMPLETE_LOCATION` | `…_WHATSAPP` |
| `20260716214253_close_onboarding_v1_compat` | `ONBOARDING_INCOMPLETE_LOCATION` | `…_WHATSAPP` |

**Correctif appliqué (PR #137, `main` = `1b46aac`)** : colonne `whatsapp_phone`
avec la valeur `'237699000001'` ajoutée aux quatre fonctions d'amorce
(`_onb_seed_complete`, `_rel_seed_complete_sans_religion`, `_oc_seed_complete`,
`_cv1_seed_complete`). Aucun `plan()`, aucune assertion, aucun code applicatif
touché. **Résultat : 40/40, 22/22, 48/48, 18/18.** Aucun échec caché derrière le
blocage WhatsApp — la prévision « 26 vertes sur 34 » est vérifiée.

Trois vérifications faites AVANT d'écrire, à refaire si le cas se représente :
le CHECK `profiles_whatsapp_phone_format` impose `^\+?[0-9]{8,15}$` ; il n'y a
**aucune contrainte d'unicité** sur `whatsapp_phone`, donc la même valeur sert à
tous les profils amorcés ; et la garde `profiles_reject_contact_details` ne
surveille que `bio`, `partner_expectations` et `first_name`, elle ne bloque donc
pas cette écriture. Le trigger `trg_profiles_auto_grant_whatsapp_consent` pose
un consentement par profil amorcé : sans effet sur les assertions.

### C. Dépendantes du vrai Supabase — 4

L'environnement de substitution n'a ni GoTrue, ni le serveur de stockage, ni le
jeu de rôles exact d'une base gérée. Les suites qui comparent un **inventaire**
(privilèges par défaut, policies, triggers) y échouent sans régression réelle —
le script le signale lui-même dans son bilan.

| Suite | Assertions en échec |
|---|---|
| `20260722224000_guard_profile_identity_fields` | T14 — `service_role` direct exige le contexte RPC |
| `20260723222350_harden_sensitive_table_grants` | A15, A16, A17 — inventaires de policies et de triggers |
| `20260724045658_harden_future_public_default_privileges` | A4, B1, B2 — privilèges par défaut |
| `20260724082000_create_candidate_showcase_backend` | T27 — `service_role` n'exécute aucune fonction V1 |

**Ces quatre-là ne se valident qu'en base réelle**, via les advisors Supabase et
une revue des grants. À ne pas « corriger » dans le banc : ce serait truquer le
thermomètre.

### D. À examiner — 2

| Suite | Symptôme | Piste |
|---|---|---|
| `20260704010000_account_moderation_backend` | `ASSERT FAIL S21a : attendu PROFILE_ADMIN_FIELDS_READ_ONLY, obtenu ACCOUNT_SUSPENDED` | **ordre des gardes** : la suspension est contrôlée avant les champs administratifs. Drift réel de comportement ou fixture suspendue à tort — à trancher. |
| `20260715120000_guard_premium_flag` | `ERROR: PROFILE_ADMIN_FIELDS_READ_ONLY` non attendue, puis transaction avortée | même famille : une garde postérieure intercepte l'écriture avant l'assertion. |
| `20260719083120_premium_authoritative_foundation` | `not ok 45 — abonnement passé à expired` | assertion sensible au temps ; le balayage quotidien du Lot I (migration/PR #135) a pu déplacer le comportement attendu. |

Ces trois-là sont les seules à mériter une lecture de code. **Aucune ne touche
un chemin membre** : modération, drapeau premium, expiration d'abonnement.

## 3. 🔬 Preuve que 64 et 65 n'ont rien cassé — et qu'elles ont réparé

Méthode : le banc a été rejoué **sur le commit précédant l'ajout de la
migration 64** (`a69ae4c`, merge PR #128 — 63 migrations, 32 suites), puis
comparé à `450ec6c`.

| | Avant 64/65 (`a69ae4c`) | Après (`450ec6c`) |
|---|---|---|
| Vertes | 18 | **22** |
| En échec | **14** | **12** |

Les 12 en échec sont un **sous-ensemble strict** des 14 : aucune suite verte
n'est devenue rouge. Et **deux suites rouges sont devenues vertes** :

- `20260719003000_enforce_suspended_account_restrictions`
- `20260723072151_restore_suspended_profile_guard`

### 🔴 Ce que ces deux suites disaient depuis le 06/08

Leur diagnostic avant le correctif :

```
not ok 10 - T10 — UPDATE de bio par un membre actif autorisé
#         have: 42501
#         want:
```

**`42501` = `insufficient_privilege`.** C'est très exactement la panne de
production du 06→12/08 : toute écriture de profil sous l'identité d'un membre
refusée, parce que le trigger `profiles_reject_contact_details`, resté
`SECURITY INVOKER`, n'avait plus le droit d'appeler `text_has_contact_details`
devenue interne.

**Le banc reproduisait l'incident. Personne ne l'a lancé pendant six jours.**

C'est la leçon opérationnelle de cette fiche : les suites de comportement sous
rôle `authenticated` avaient détecté la panne le jour même de son introduction.
Le coût de la détection était d'une commande.

## 4. Comment jouer le banc

Sur le **VPS `srv1384501`** (PostgreSQL 16 + pgTAP, pas de Docker sur le poste
Windows). ⚠️ **Deux pièges relevés le 14/08, à ne plus subir :**

1. le script est enregistré dans Git en mode **`100644`**, sans bit
   d'exécution — `./scripts/pgtap/run-pgtap.sh` répond **`Permission denied`**
   sur tout clone frais. Passer par `bash`. (Dette : `git update-index
   --chmod=+x scripts/pgtap/run-pgtap.sh`.)
2. le script vise `PGUSER=postgres` par la socket Unix, en authentification
   **`peer`** : lancé sous `root`, il échoue en `FATAL: role "root" does not
   exist`. Il faut être l'utilisateur système `postgres`, et le clone jetable
   doit lui être lisible.

```bash
cd /tmp && rm -rf kslf-pgtap
git clone -b main --depth 1 https://github.com/jpk4me-boop/kassalafam-mariage-a-tout-prix.git kslf-pgtap
chmod -R a+rX /tmp/kslf-pgtap
sudo -u postgres bash /tmp/kslf-pgtap/scripts/pgtap/run-pgtap.sh                  # les 34 suites
sudo -u postgres bash /tmp/kslf-pgtap/scripts/pgtap/run-pgtap.sh 20260812053000   # une seule
```

Prérequis : `sudo apt-get install -y postgresql-16 postgresql-16-pgtap`.

Le script rejoue **toutes** les migrations sur une base jetable, puis les
suites. Deux garde-fous refusent de partir sur autre chose qu'un bac à sable :
le nom de base doit finir par `_pgtap`, et tout hôte ressemblant à une base
Supabase gérée est rejeté. Réglages : `PGHOST`, `PGPORT`, `PGUSER`, `PGTAP_DB`.

Pour lire la sortie TAP brute d'une suite (assertions une par une) :

```bash
sudo -u postgres psql -X -q -t -A -d kassalafam_pgtap -f /tmp/kslf-pgtap/supabase/tests/NOM.test.sql 2>&1 \
  | grep -E "^1\.\.|^ok |^not ok|^ERROR" \
  | awk '/^ok /{v++; next} {print} END{print "-- assertions vertes : " v+0}'
```

⚠️ **`-A` n'est pas optionnel** : sans lui, `psql -t` préfixe chaque ligne d'un
espace et aucune ancre `^1\.\.` ou `^not ok` n'accroche — la sortie paraît
vide alors que la suite a tourné. Le compte de vertes doit égaler le plan.

**Le banc du 13/08 a été exécuté dans un bac à sable Linux jetable**, pas sur le
VPS — postgresql-16 + postgresql-16-pgtap installés, 65 migrations rejouées.
Le résultat est reproductible à l'identique sur le VPS : le script ne dépend que
de psql et du dépôt.

## 5. Ce qu'il reste à faire, par rentabilité

1. ~~Renseigner le WhatsApp dans 4 fixtures (§2 B)~~ — **FAIT le 14/08**
   (PR #137). 26 vertes sur 34, comme prévu.
2. **Trancher les 3 suites du §2 D** — ordre des gardes et expiration
   d'abonnement. Lecture de code, pas de fixture. **C'est désormais le premier
   poste.**
3. **Compléter ou retirer `safety_report_actions`** (§2 A) : un gabarit à
   marqueurs n'est pas un test.
4. Laisser les 4 suites d'inventaire (§2 C) : elles ne se valident qu'en base
   réelle.
5. Poser le bit d'exécution sur `run-pgtap.sh` (§4, piège 1).

## 6. Règle actée

> **Jouer le banc pgTAP après chaque migration touchant un privilège, un
> trigger ou une garde — avant le merge, pas après l'incident.** Une suite de
> comportement sous `set local role authenticated` voit ce qu'aucune revue de
> code ne voit : c'est démontré au §3, sur une panne réelle de six jours.
