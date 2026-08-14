# LOT C — pilote SebPay : fiche d'exécution vérifiée

> Établie le 12/08/2026 en lisant le CODE (clone `main`), le back-office SebPay
> et la documentation officielle complète, pas la mémoire. En cas de
> contradiction, cette fiche fait foi.
>
> **Rév. 8 — 13/08/2026, 21 h 54 UTC. LA TRANSACTION FANTÔME EST SOLDÉE.**
> `kslf_b38d981…` passée en `cancelled`. **Le registre `payment_transactions`
> est propre : 4 lignes SebPay, toutes `cancelled`, aucune `initiated`.**
> Recoupé côté serveur après l'écriture. La dette correspondante du §9 est
> close.
>
> **Rév. 7 — 13/08/2026, soir. LA PISTE « IP DU POSTE » EST MORTE.** L'adresse
> `129.0.60.44`, approuvée par SebPay à 17 h 34, était **déjà périmée moins de
> 4 h plus tard** : le poste est passé à `129.0.60.180` (relevé ipify). Sonde
> `GET /countries` → **403**, cause entendue. **Ne plus resoumettre d'adresse de
> poste** : le cycle d'approbation de SebPay (des heures) est plus long que le
> bail du FAI. Tout repose désormais sur `148.230.114.82` (VPS, fixe) ou sur
> l'option A. Voir §2 bis.
>
> **Rév. 6 — 13/08/2026. APPROBATION PARTIELLE.** SebPay a approuvé
> `129.0.60.44` (poste), **`148.230.114.82` — la seule adresse fixe — reste
> « En attente »**. Les deux soumissions figurent bien au back-office : le trou
> administratif de la rév. 5 est comblé.
>
> **Rév. 5 — 12/08/2026, soir. LE DIAGNOSTIC EST CLOS.** La cause du 403 est
> **administrative, pas technique** : aucune soumission d'URL/IP n'était
> enregistrée sur le compte. Réponse du support SebPay reçue à 18 h 25. Voir §2.
> **Le code n'a jamais été en cause et n'a rien à changer.**

## 0. ÉTAT

- **Production saine et figée.** `450ec6c`, `dpl_4j61WKLpaWZbe5dJNDKiiQwgxHRX`,
  READY depuis le 12/08 à 12 h 50 min 37 UTC — le redéploiement de repli qui a
  refermé les paiements. `SEBPAY_PAYMENTS_ENABLED=false`. `/premium` affiche
  « Bientôt disponible », ce qui est exact. **Aucun déploiement depuis.**
- **`main` = `450ec6c`.** PR #134, #135 et #136 mergées. Aucune branche non
  mergée. **65 migrations**, registre aligné. Recoupé le 13/08.
- **Blocage : externe, TOUJOURS ENTIER** (§2 bis). L'unique approbation obtenue
  porte sur une adresse qui n'existe déjà plus.
- ✅ **Registre des transactions propre** (rév. 8, 13/08 à 21 h 54 UTC) :
  4 transactions SebPay, **toutes `cancelled`**, aucune `initiated`. La
  transaction fantôme `kslf_b38d981695704aabb3d60e5896bfef48`
  (id `74cb39af-71e6-4f53-9d13-1c4ad8192453`) a été soldée à la main depuis le
  SQL Editor Supabase, une fois le diagnostic clos.

## 1. Compte marchand — VÉRIFIÉ ✅

- **Compte : KASSALAFAM MARIAGE** — `acc_20260723204641846136`, type MARCHAND
- Titulaire : Jean Pierre KENNE, **pays Cameroon**, inscrit le 23/07/2026
- **KYC : COMPTE VÉRIFIÉ** (courriel de confirmation Sebpay Africa reçu)
- Fonctionnalités cochées : collecte de paiements, retraits 15 pays, tableau de
  bord, **API & intégration marchands**
- Environnement Réel (Live), `PRODUCTION`. Pas de sandbox chez SebPay.
- 2FA désactivée sur le compte.
- **Empreintes des clés** (pour détecter une confusion de compte sans jamais
  écrire les secrets) : publique `pk_live_…SXHvgukjG`, secrète `sk_live_…7CID`.

⚠️ Le sélecteur de compte est en haut à gauche du back-office. **Vérifier le
compte affiché AVANT toute action** — régénération de clé comme soumission
d'adresse. L'autre compte est **Cercle des Titans**, `acc_20260723065904714537`.

## 2. 🔴 LA CAUSE DU 403 — soumission URL/IP absente

### Réponse du support SebPay, 12/08 à 18 h 25 (verbatim)

> « Vous devez soumettre votre adresse url et IP depuis votre dashboard et
> attendre validation pour utiliser l'API. Actuellement, **nous n'avons aucune
> soumission d'adresse liée à votre compte `acc_20260723204641846136`**. »

Tout s'explique : sans soumission validée, l'API est fermée en bloc, y compris
en lecture seule. Cohérent avec chaque observation du 12/08 (401 sans clé,
403 avec clés valides, sur `POST /collections` comme sur `GET /countries`).

**La « Question ouverte » de la rév. 3 est tranchée** : la déclaration d'IP
tentée vers 13 h 30 n'a **jamais été enregistrée**. Deux causes possibles, la
seconde étant la plus probable : formulaire non soumis, ou **soumission partie
sur le mauvais compte** (le sélecteur affichait « Cercle des Titans »).

## 2 bis. 🔴 ÉTAT DE L'ALLOWLIST — l'approbation obtenue est sans valeur

Back-office → **API Développeur → Adresses IP autorisées**, relevé le 13/08 :

| IP | Statut SebPay | Site associé | Nature | Verdict |
|---|---|---|---|---|
| `148.230.114.82` | **En attente** · Actif | `https://kassalafam.com` | **VPS Hostinger `srv1384501` — FIXE** | **la seule qui compte** |
| `129.0.60.44` | Approuvé · Actif | `https://kassalafam.com` | poste de développement — **DYNAMIQUE** | **caduque** (§ ci-dessous) |

### 🔴 L'approbation du poste a expiré avant d'avoir servi

| Heure (locale) | Fait |
|---|---|
| 17 h 34 | Courriel SebPay : « l'adresse IP **129.0.60.44** […] a été approuvée […] Elle peut désormais authentifier des appels vers l'API Sebpay. » |
| ~21 h 30 | `(Invoke-RestMethod "https://api.ipify.org?format=json").ip` → **`129.0.60.180`**. L'adresse a changé. |
| ~21 h 30 | Sonde `GET /countries` → **403**. Attendu : l'appel ne part plus de l'adresse approuvée. |

**Règle qui en sort — à ne plus jamais enfreindre :**

> **Ne soumettre à SebPay que des adresses FIXES.** Leur cycle d'approbation se
> compte en heures ; un bail DHCP résidentiel est plus court. Une adresse de
> poste sera périmée avant d'être approuvée — c'est structurel, pas de la
> malchance. **Aucune resoumission de `129.0.60.180` : elle mourra pareil.**

Corollaire : **la sonde de lecture seule n'est réalisable QUE depuis le VPS**,
et donc seulement une fois `148.230.114.82` approuvée. Le contournement
« sonder depuis le poste » de la rév. 6 est abandonné.

### Ce qui reste ouvert, et l'unique action

Le blocage est intact : aucune adresse utilisable n'est approuvée. **Une seule
action débloque quoi que ce soit** — relance du support, envoyée le 13/08 au
soir, portant deux demandes qui se répondent :

1. **Approuver `148.230.114.82`** — adresse fixe du VPS, la seule exploitable en
   production. La ligne existe et attend depuis le 12/08 au soir.
2. **Confirmer par écrit l'exemption d'allowlist du 11/08** pour
   `https://kassalafam.com` (« sans restriction liée à l'allowlist IP »). Si
   elle vaut, la déclaration du domaine suffit et le point 1 devient facultatif.

Argument central du courriel : l'approbation du 13/08 est **la démonstration
par les faits** qu'une IP dynamique ne peut pas fonctionner chez eux — périmée
en moins de 4 h.

### ⚠️ Le conflit de fond qui reste à trancher

SebPay exige une IP. **KASSALAFAM tourne en serverless sur Vercel : il n'y a
aucune IP sortante fixe** — les appels partent d'adresses qui changent à chaque
exécution. Sur Vercel, les IP statiques passent par **Secure Compute**, une
option Enterprise. C'est exactement ce que leur courriel du **11/08** était
censé résoudre en accordant à kassalafam.com une exemption d'allowlist IP,
« sans restriction liée à l'allowlist IP » — le support n'en tient pas compte.

Trois issues, par ordre de préférence :

- **A. URL seule.** Leur faire confirmer par écrit que la soumission de
  `kassalafam.com` suffit, l'exemption du 11/08 restant valable.
  **Aucun travail de notre côté.** ⏸️ Relancé le 13/08, sans réponse.
- **B. Relais par le VPS.** Vercel appelle `srv1384501`, le VPS appelle SebPay
  depuis `148.230.114.82`. Ça marche, mais ça ajoute un composant à sécuriser
  et à surveiller, **sur le chemin du paiement**. **Bloqué : l'IP du VPS est
  encore « En attente ».** Ne rien construire avant son approbation ET la
  réponse sur A — si A passe, c'est du travail jeté.
- **C. Vercel Secure Compute.** Enterprise. Écarté.

### Le signal à guetter

Sonde en lecture seule, **à lancer depuis le VPS `srv1384501` uniquement**, et
seulement une fois son IP approuvée. **HTTP 200 sur `GET /countries` = l'accès
API est ouvert.** C'est le feu vert, avant même de rouvrir les paiements.

```powershell
$pk = Read-Host "X-Public-Key"
$sk = Read-Host "X-Secret-Key" -AsSecureString
$h = @{ "X-Public-Key" = $pk; "X-Secret-Key" = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sk)) }
try {
  $r = Invoke-WebRequest -Uri "https://newapi.sebpay.bj/api/v1/countries" -Headers $h -Method GET -UseBasicParsing
  "STATUS $($r.StatusCode)"; $r.Content
} catch {
  "STATUS $($_.Exception.Response.StatusCode.value__)"
  if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message }
  else { (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() }
}
"PK saisie se termine par : $($pk.Substring($pk.Length-9))"
Remove-Variable pk, sk, h
```

⚠️ **Coller ce bloc d'un seul tenant, pas ligne à ligne** : collé pendant qu'un
`Read-Host` attend, le terminal avale une ligne du script comme si c'était la
clé (arrivé le 13/08). **Toujours lire le CORPS de la réponse**, pas seulement
le statut : le `message` de l'enveloppe distingue « IP non autorisée » de
« compte non approuvé ». Et **`Remove-Variable` n'est pas optionnel** : `$h`
contient la clé secrète en clair.

Lecture du résultat :

- **200** → clés, compte et corridor sont bons ; **seule l'allowlist bloquait**.
  Enchaîner sur `GET /operators?country=CM` pour lever au passage l'ambiguïté
  `operator` code/slug du §4, **sans rien déployer**.
- **403** → l'adresse d'appel n'est pas (ou plus) approuvée. Vérifier l'IP
  effective avant d'écrire au support.
- **401** → mauvaises clés. Comparer l'empreinte affichée à `…SXHvgukjG` (§1) :
  si elle diffère, ce sont celles de Cercle des Titans.

⚠️ **L'exemption et la soumission ne couvrent QUE `kassalafam.com`.** Cercle des
Titans exigera une démarche séparée, sur son propre compte.

## 3. Les variables RÉELLEMENT lues par le code

| Variable | Valeur | Notes |
|---|---|---|
| `SEBPAY_PAYMENTS_ENABLED` | `false` hors fenêtre de test | booléen STRICT |
| `SEBPAY_PILOT_MODE` | `true` | verrouille sur les numéros pilotes |
| `SEBPAY_ENVIRONMENT` | **`live`** | **`test` ou `live` UNIQUEMENT** |
| `SEBPAY_PUBLIC_KEY` | clé `pk_live_…` | secret : jamais en conversation |
| `SEBPAY_SECRET_KEY` | clé `sk_live_…` | secret : jamais en conversation |
| `SEBPAY_CALLBACK_URL` | `https://kassalafam.com/api/webhooks/sebpay` | HTTPS obligatoire |
| `SEBPAY_PILOT_MTN_PHONE` | `237672482763` | **valeur confirmée correcte** — la garde pilote l'a laissée passer le 12/08 à 11 h 04 |
| `SEBPAY_PILOT_ORANGE_PHONE` | facultatif | à ne poser que si test Orange |

### Pièges confirmés

1. **`SEBPAY_ENVIRONMENT=production` échoue** : seuls `test` et `live` acceptés.
2. **`SEBPAY_MTN_OPERATOR` / `SEBPAY_ORANGE_OPERATOR` n'existent pas** : aucun code ne les lit.
3. **`SEBPAY_API_BASE_URL` n'est pas lue** : origine figée dans `CONFIRMED_SEBPAY_API_ORIGINS`.
4. **`vercel env add` crée en type Sensitive par défaut.** `SEBPAY_PAYMENTS_ENABLED` et `CRON_SECRET` sont donc illisibles — à recréer en clair depuis le tableau de bord pour les non-secrets.

### Commandes de bascule

```powershell
cd C:\Users\USER\Projects\kassalafam-mariage-a-tout-prix
npx vercel env rm SEBPAY_PAYMENTS_ENABLED production --yes
"true" | npx vercel env add SEBPAY_PAYMENTS_ENABLED production
npx vercel redeploy https://kassalafam-mariage-a-tout-prix-4b8xtum3f.vercel.app
```

(`"false"` pour refermer. Même URL source aux deux redéploiements : `vercel
redeploy` recrée un déploiement neuf en relisant les variables.)

⛔ **Verrou : ne pas lancer cette bascule tant que §2 bis n'est pas résolu.**
Aucune approbation utilisable n'existe à ce jour.

## 4. Contrat API — VÉRIFIÉ sur la documentation complète (12/08)

Les onze pages de `new.sebpay.bj/fr/docs` ont été parcourues. **L'implémentation
est conforme sur tous les points vérifiables.** Le jour où le compte est
débloqué, il n'y a rien à changer dans le code.

- Base : `https://newapi.sebpay.bj/api/v1` ✅
- En-têtes : `X-Public-Key` / `X-Secret-Key` ✅
- `POST /collections` — `amount`, `currency`, `phone`, `operator`, `country`, `external_reference`, `callback_url` ✅
- `GET /collections/{id_or_reference}` ✅
- Enveloppe `{ success, data, message }` ✅
- Statuts `pending` / `approved` / `rejected` — les trois traités par `mapSebPayStatus` ✅
- Cameroun : ISO **`CM`**, devise **`XAF`**, préfixe **+237**, Active ✅
- MTN Cameroun : code `mtn`, **slug `mtn-cm`**, Active ✅ ; Orange : `orange-cm`, Active ✅
- OTP : exigé seulement par Orange CI / BF / SN. **Aucun `otp_code` requis au Cameroun** ✅
- Webhook : **HMAC-SHA256 du corps JSON**, en-tête **`X-SebPay-Signature`**, clé secrète. Réponse HTTP 200 sous 5 secondes. Encodage du condensat (hex ou base64) NON documenté.
- Codes : `401 Invalid credentials`, `403 Unauthorized`, `400 Bad Request`, `404 Not Found`.
- Autres endpoints disponibles : `GET /countries`, `GET /operators[?country=XX]`, `POST /payouts`, `GET /payouts/{ref}`, `GET /c/calculate-fee`.

### Ambiguïté relevée dans leur documentation

Le champ `operator` est décrit comme « Slug de l'opérateur » mais **tous** leurs
exemples passent le **code** (`mtn`) avec `country` séparé, alors que leur table
distingue CODE `mtn` et SLUG `mtn-cm`. Nous envoyons le slug. **À lever si le
403 tombe sans que la collecte passe** — c'est la première hypothèse à tester
dans ce cas. Levable gratuitement par `GET /operators?country=CM` dès la
première sonde réussie.

## 5. Le pilote, quand l'accès sera ouvert

Ordre :

1. **Approbation de `148.230.114.82` OU confirmation écrite de l'option A.**
   ⛔ **Verrou dur : rien ne commence avant l'une des deux.**
2. Sonde §2 bis **depuis le VPS** → **200**.
3. `SEBPAY_PAYMENTS_ENABLED=true` → **Redeploy**.
4. **Paiement pilote réel de 2 500 F** (MTN `237672482763`).
5. Contrôles en base (ci-dessous) : transaction `succeeded`, webhook journalisé,
   premium activé.
6. Rollback à la moindre anomalie : `SEBPAY_PAYMENTS_ENABLED=false` + Redeploy.

```sql
select id, provider, status, amount_xaf, requested_at, updated_at
from payment_transactions where provider = 'sebpay'
order by requested_at desc limit 5;

select id, received_at, mapped_status, provider_reference
from payment_webhook_events order by received_at desc limit 5;

select id, profile_id_snapshot, status, starts_at, ends_at, source
from premium_subscriptions order by created_at desc limit 5;

select id, first_name, is_premium from profiles where is_premium;
```

Projet Supabase : `cmifejrcnvixwbxhzdpx`. Compte de test : **Yacynthe**,
`099d8383-3f4b-4eac-b4a0-f9e3f7a6b6bb`. Plan pilote : `premium_1_mois`,
`2d8a0923-896b-4016-b770-372fa0429e4d`, 2 500 XAF, 30 jours.

**Ligne de base au 13/08 à 21 h 54 UTC — le registre est propre, toute ligne
nouvelle sera donc lisible sans ambiguïté :**

| Référence | Statut | Demandée | Soldée |
|---|---|---|---|
| `kslf_b38d981695704aabb3d60e5896bfef48` | `cancelled` | 12/08 12 h 45 | **13/08 21 h 54** |
| `kslf_2c7af870c7274fd58a627b1c81c802d1` | `cancelled` | 12/08 11 h 04 | 12/08 12 h 45 |
| `kslf_ab4a699000ea43488fcf8103321b4268` | `cancelled` | 01/08 22 h 35 | 12/08 10 h 31 |
| `kslf_2a272869afc44a6ea3c02bf168e68612` | `cancelled` | 01/08 21 h 57 | 01/08 22 h 35 |

**`payment_webhook_events` : 0 ligne, depuis toujours** · `premium_subscriptions` :
0 abonnement actif · **`profiles where is_premium` : 0**.

### Comment solder une transaction à la main (si le cas se représente)

Deux pièges de la table, vérifiés sur sa structure réelle :

1. la contrainte `payment_transactions_completion_state` **exige `completed_at`
   non nul** dès que le statut quitte `initiated`/`pending`. Un
   `set status = 'cancelled'` seul échoue en violation de contrainte ;
2. **aucun trigger n'est posé sur `payment_transactions`** (`pg_trigger` ne
   renvoie rien) : `updated_at` ne se met pas à jour tout seul.

C'est exactement le geste de la RPC `start_sebpay_checkout` sur les tentatives
périmées. À coller dans le **SQL Editor Supabase** (le VPS est le poste pgTAP,
il ne pointe pas la prod), **sans `begin;/commit;`** — l'éditeur n'affiche que
le résultat de la dernière instruction et masquerait le `returning`, alors que
l'`UPDATE` est déjà atomique et rendu non rejouable par ses trois prédicats :

```sql
update public.payment_transactions
   set status       = 'cancelled'::public.payment_transaction_status,
       completed_at = pg_catalog.now(),
       updated_at   = pg_catalog.now()
 where provider_reference = '<référence>'
   and provider  = 'sebpay'
   and status    = 'initiated'::public.payment_transaction_status
returning id, status, completed_at, updated_at;
```

`failure_code` reste à `NULL` : annulation technique, pas échec de paiement —
et `payment_transactions_failure_code_state` l'interdirait hors statut `failed`.

⚠️ Rappel : une `initiated` périmée **ne bloque pas** le membre. La RPC annule
d'office celles de plus de 15 minutes avant d'ouvrir un nouveau checkout. Ce
solde manuel est du rangement, jamais un correctif.

## 6. Le chemin Premium déverrouillé

Un abonnement a existé le 11/08 (octroi manuel `admin`, révoqué 30 min plus
tard). Le parcours **payant** n'a jamais abouti. Restent à observer avec un
compte réellement premium : `/visitors`, `/favorites` (« Ils vous ont ajouté »)
et `/premium`. **C'est la première occasion de voir le chemin déverrouillé du
verrou du Lot B.**

## 7. Rollback

`SEBPAY_PAYMENTS_ENABLED=false` + **Redeploy**. Le fournisseur repasse en
`LockedSebPayProvider` : aucun secret lu, aucun appel réseau. **Ce repli est en
place depuis le 12/08 à 12 h 50 UTC.**

## 8. Journal — pour mémoire

| Heure | Fait |
|---|---|
| **12/08 (UTC)** | |
| 11 h 04 min 57 | `POST /api/premium/subscribe` → **502**. La garde pilote a LAISSÉ PASSER `237672482763` ; transaction `initiated` écrite à 11 h 04 min 58. |
| 11 h 06 min 23 | Second essai, autre numéro → **403 `pilot_restricted`**, aucune écriture. Le verrou pilote fonctionne comme documenté. |
| 12 h 30 min 34 | Lot J déployé (PR #136, `450ec6c`) : le statut HTTP du fournisseur survit enfin à l'erreur. |
| 12 h 36 min 49 | Redéploiement, paiements ouverts. |
| 12 h 45 min 52 | Nouvel essai → `providerHttpStatus=403`. Transaction `kslf_b38d981…` écrite, **restée `initiated`**. |
| 12 h 50 min 37 | **Repli** : paiements refermés, `dpl_4j61WK…`. État actuel. |
| ~13 h 00 | Sondes en lecture seule : `GET /countries` et `GET /operators?country=CM` → **403**. |
| ~13 h 05 | `GET /countries` **sans clé**, réseau tiers → **401**. L'API distingue bien l'absence d'identifiants. |
| ~13 h 30 | Tentative de déclaration d'IP dans le back-office → **403** encore. **On sait depuis que rien n'avait été enregistré.** |
| **18 h 25** | **Réponse du support : aucune soumission URL/IP sur le compte.** Cause trouvée. |
| soir | Resoumission : URL `kassalafam.com` + IP `148.230.114.82` + IP `129.0.60.44`. Les deux lignes apparaissent bien au back-office. |
| **13/08** | |
| **17 h 34 (local)** | Courriel SebPay : **`129.0.60.44` APPROUVÉE**. |
| ~21 h 15 (local) | Relevé du back-office : `148.230.114.82` toujours **« En attente »**. « Dernière utilisation : jamais » sur les deux lignes. |
| ~21 h 30 (local) | Sonde depuis le poste → **403**. |
| **~21 h 30 (local)** | **`ipify` → `129.0.60.180`. L'IP approuvée n'existe déjà plus : l'approbation a tenu moins de 4 h.** Piste « IP de poste » abandonnée. |
| soir | Relance du support : approbation de `148.230.114.82` + option A par écrit. |
| **21 h 54 UTC** | **Transaction fantôme `kslf_b38d981…` soldée en `cancelled`** depuis le SQL Editor. Registre vérifié : 4 lignes, toutes `cancelled`. |

### Ce qui avait été éliminé, et le reste

Éliminés à juste titre : les clés (401 vs 403), le KYC, le corridor BJ → CM,
l'opérateur, le montant, le numéro, le réseau de Vercel, **et le code**.
Ce qui manquait à la liste : **l'autorisation administrative du compte**.

**Leçon de méthode** : quand un fournisseur refuse un compte **à l'identique sur
tous ses endpoints, y compris en lecture seule**, la cause est administrative.
Aucune quantité d'analyse du code ne l'aurait trouvée — seul le support pouvait
répondre. **Écrire au fournisseur AVANT d'éplucher onze pages de documentation
aurait fait gagner une demi-journée.**

**Leçon de la rév. 6** : une approbation partielle se lit comme un refus tant
qu'on n'a pas vérifié **QUELLE** ligne a été approuvée.

**Leçon de la rév. 7** : une autorisation adossée à une ressource **instable**
(bail DHCP) n'est pas une autorisation. Quand le délai d'approbation dépasse la
durée de vie de la ressource, la démarche ne peut structurellement pas aboutir —
il fallait ne soumettre que l'IP fixe, et l'IP de poste n'a servi qu'à faire
perdre un aller-retour. **Vérifier l'IP effective AVANT de conclure quoi que ce
soit d'un 403.**

## 9. Dettes ouvertes

- 🔴 **`148.230.114.82` en attente d'approbation** — la seule IP fixe, donc le
  seul chemin possible avec l'option B. Relance envoyée le 13/08.
- 🔴 **Option A jamais tranchée par écrit** — l'exemption d'allowlist du 11/08
  est toujours en l'air. Relancée le 13/08 dans le même courriel.
- **Ne plus soumettre d'IP dynamique** (règle §2 bis).
- `SEBPAY_PAYMENTS_ENABLED` et `CRON_SECRET` sont en type Sensitive : à recréer
  en clair pour les non-secrets.
- Encodage du condensat HMAC du webhook : hex ou base64, non documenté.
  `payment_webhook_events` est vide depuis toujours — **0 ligne au 13/08**.
  Aucun webhook SebPay n'a jamais été reçu, donc l'encodage n'a jamais été
  éprouvé. **À surveiller de près lors du premier paiement réussi.**
- Ambiguïté `operator` : code ou slug (§4).
- ~~Transaction fantôme à solder~~ — **CLOSE le 13/08 à 21 h 54 UTC** (§5).
