# FICHE CHANTIER — Notifications WhatsApp aux membres

> KASSALAFAM — préparée le 03/08/2026, **validée et partiellement livrée le
> 03/08 au soir**. Mise à jour après les PR #107 et #108.

---

## 0. ÉTAT AU 03/08/2026 (soir) — À LIRE EN PREMIER

**Deux chemins existent désormais. Le chemin simple est LIVRÉ et suffit
aujourd'hui.**

| | Chemin SIMPLE (livré ✅) | Chemin AUTOMATIQUE (en pause ⏸️) |
|---|---|---|
| Page | `/admin/notifications` « À prévenir » | — |
| Geste | 1 clic → WhatsApp s'ouvre, message prêt, **vous envoyez** | envoi sans intervention |
| Meta | **aucun** | Business Manager vérifié + WABA + numéro dédié + modèles approuvés |
| Coût | **0** | par message (catégorie utility) |
| Livré par | **PR #108** | PR #107 (fondation) puis PR B/C à faire |

**Décision du 03/08 au soir : on s'arrête au chemin simple.** La mise en place
Meta est lourde en démarches administratives et n'apporte rien à 15 membres.
La fondation (PR #107) reste en production, en sommeil, sans coût : elle
attendra le jour où le volume la justifiera (quelques centaines de membres, ou
quand l'envoi manuel deviendra pénible).

### Ce qui est en production

- **PR #107 (migration 54)** — fondation : `member_notifications` capte
  désormais les nouveaux messages, nouveaux intérêts et intérêts acceptés
  (avant : seulement les décisions de vérification) ; tables
  `notification_channel_consents` (opt-in dédié) et `notification_deliveries`
  (file, en sommeil) ; carte « Notifications WhatsApp » sur `/profile`.
- **PR #108** — page `/admin/notifications` : liste les membres actifs ayant
  des notifications non lues, avec un bouton `wa.me` par membre et le message
  déjà rédigé, affiché sous le bouton pour relecture. Aucun envoi automatique,
  aucune écriture, aucune dépendance externe.

### Pour reprendre le chemin automatique un jour

Tout est décrit aux §3 à §6 ci-dessous (Phase 0 Meta, PR B adapter + cron,
pilote, PR C webhook/STOP). Décisions déjà prises : **Meta Cloud API en
direct**, **5 événements V1**, **`{{1}}` = prénom du destinataire**, **SIM
dédiée disponible**. Aucun code d'envoi n'existe encore ; le flag
`WHATSAPP_NOTIFICATIONS_ENABLED` n'est pas posé.

---

## 1. Principes NON NÉGOCIABLES (hérités du CLAUDE.md) — valables pour les deux chemins

- `member_notifications` **reste la source de vérité**. WhatsApp est un canal
  de LIVRAISON secondaire : aucune fonctionnalité métier n'en dépend.
- **Événements autorisés, aucun autre** : nouveau message reçu · nouvel
  intérêt reçu · intérêt accepté · mise à jour de vérification · sécurité du
  compte.
- **JAMAIS le contenu d'un message**, jamais le prénom d'un AUTRE membre. Seul
  le prénom du destinataire est utilisé ; le lien pointe toujours vers `/login`.
  (Vérifié par test dans les deux chemins.)
- **Consentement explicite dédié** pour l'envoi automatique : donner son numéro
  ne vaut pas accord. Retrait immédiat, jamais activé par défaut.
- **Aucune campagne marketing** par ce canal sans demande explicite.
- Jetons/secrets jamais en conversation (`Read-Host -AsSecureString`).

## 2. Fournisseur retenu (si reprise du chemin automatique)

**API Cloud WhatsApp de Meta EN DIRECT** (graph.facebook.com), sans
intermédiaire : facturation par message, catégorie « utility » (la moins
chère), réponses gratuites dans la fenêtre de 24 h, pattern identique à
l'adapter SebPay. Tarif exact vers le Cameroun à relever le moment venu sur
https://business.whatsapp.com/products/platform-pricing — ne rien budgéter sans
ce relevé. Alternative en cas de blocage : BSP (360dialog/Twilio), plus cher.

## 3. Phase 0 — Prérequis ADMINISTRATIFS (⏸️ non entamée)

1. Meta Business Manager vérifié pour TITANEX SARL (RCCM `CM-DLA-02-2026-B13-00145`,
   NIU `M022618389246M`).
2. Compte WhatsApp Business (WABA) dans ce Business Manager.
3. **Numéro DÉDIÉ** — ⚠️ JAMAIS le numéro personnel : un numéro enrôlé sur
   l'API Cloud ne peut plus utiliser l'application WhatsApp normale. SIM dédiée
   disponible côté Grand Maître.
4. Jeton système permanent, posé dans Vercel comme les clés SebPay.
5. Relevé des tarifs utility → Cameroun.
6. Soumission des 5 modèles (§6) à l'approbation Meta (Utility, fr).
7. Politique de confidentialité : ajouter le canal WhatsApp (destinataire :
   Meta ; données transmises : numéro + prénom du destinataire).

## 4. Architecture du chemin automatique (fondation déjà en place)

```
member_notifications (source de vérité)              ✅ alimentée (PR #107)
        │  trigger AFTER INSERT
        ▼
notification_deliveries (file)                        ✅ créée (migration 54)
        │  pending → sent | failed | skipped (terminaux immuables)
        ▼
/api/cron/dispatch-whatsapp                           ⏸️ PR B
        ▼
adapter src/lib/server/whatsapp/                      ⏸️ PR B
   allowlist ["https://graph.facebook.com"], fail-closed, mode pilote
        ▼
API Cloud Meta → WhatsApp du membre
```

Variables Vercel à poser le moment venu (une à la fois) :
`WHATSAPP_NOTIFICATIONS_ENABLED` (false) · `WHATSAPP_ACCESS_TOKEN` ·
`WHATSAPP_PHONE_NUMBER_ID` · `WHATSAPP_PILOT_NUMBERS`.

## 5. Phasage restant

| Étape | Contenu | Dépendance Meta |
|---|---|---|
| ~~PR A~~ | ~~Migration 54 + opt-in~~ — **LIVRÉE (#107)** | — |
| **PR B** ⏸️ | Adapter Cloud API + cron `dispatch-whatsapp` + tests hors réseau | Aucune (flag off) |
| **Pilote** ⏸️ | Variables posées → flag true → numéro de Grand Maître seul → contrôles | Oui |
| **PR C** ⏸️ | Webhook Meta : statuts de livraison + **STOP entrant = retrait automatique** | Oui |

## 6. Modèles à soumettre (Utility, fr) — `{{1}}` = prénom du DESTINATAIRE

1. **nouveau_message** : « Bonjour {{1}}, vous avez reçu un nouveau message sur
   KASSALAFAM. Connectez-vous pour le lire : https://kassalafam.com/login »
2. **nouvel_interet** : « Bonjour {{1}}, un membre s'intéresse à votre profil
   sur KASSALAFAM. Découvrez qui : https://kassalafam.com/login »
3. **interet_accepte** : « Bonne nouvelle {{1}} ! Votre intérêt a été accepté
   sur KASSALAFAM. Vous pouvez maintenant échanger :
   https://kassalafam.com/login »
4. **verification_profil** : « Bonjour {{1}}, le statut de vérification de
   votre profil KASSALAFAM a été mis à jour. Consultez-le :
   https://kassalafam.com/login »
5. **securite_compte** : « Bonjour {{1}}, une activité concernant la sécurité
   de votre compte KASSALAFAM nécessite votre attention :
   https://kassalafam.com/login »

Chacun se termine par « Répondez STOP pour ne plus recevoir ces
notifications. » (effectif à la PR C ; d'ici là, retrait via `/profile`).

Ces textes sont les mêmes que ceux préremplis par la page « À prévenir » —
la transition du manuel vers l'automatique ne changera donc rien pour les
membres.

## 7. Ce qui n'est PAS prévu

Relances automatiques d'onboarding/vitrine (marketing — phase séparée, jamais
sans demande explicite) · réponses automatiques aux messages entrants (hors
STOP) · notifications push PWA (la file les accueillera via `channel='push'`) ·
tout envoi vers un membre suspendu ou sans consentement.
