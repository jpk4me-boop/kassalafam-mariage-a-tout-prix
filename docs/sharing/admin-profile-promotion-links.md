# Liens promotionnels administrateur — backend Draft

## Objectif

Permettre au back-office KASSALAFAM de préparer des liens promotionnels
partageables sur les réseaux sociaux depuis les cartes membres, sans exposer la
fiche d’administration, un UUID, une URL signée de photo privée ou une donnée
personnelle non autorisée.

Cette PR livre uniquement le backend. Elle ne modifie pas encore la page
`/admin/members` et ne crée aucune route publique.

## Source juridique

Le backend s’appuie exclusivement sur `profile_promotion_consents`.

Le membre choisit lui-même :

- la photo utilisable ;
- les réseaux autorisés parmi Facebook, Instagram, Snapchat et WhatsApp ;
- une durée de 7, 30 ou 90 jours.

Ce consentement est distinct du lien public limité `/p/[token]` et de la vitrine
publique `/candidats`.

## Cycle de vie d’un lien

1. Le serveur vérifie la session administrateur.
2. L’administrateur choisit un membre, un réseau et éventuellement une
   expiration plus courte.
3. La RPC revérifie le profil, le consentement, le réseau et la photo.
4. Un jeton aléatoire de 32 octets est généré.
5. Le jeton en clair est retourné une seule fois.
6. Seuls son hash SHA-256 et un préfixe administratif de huit caractères sont
   conservés.
7. Le futur écran pourra construire une URL de la forme
   `https://kassalafam.com/promo/<token>`.
8. La future route résoudra le jeton côté serveur, puis affichera une projection
   publique limitée.

Plusieurs liens peuvent rester actifs simultanément. Une nouvelle diffusion ne
révoque donc pas automatiquement les publications déjà partagées.

## Invalidation immédiate

La résolution retourne zéro ligne dès qu’une des conditions suivantes devient
fausse :

- compte actif ;
- profil approuvé ;
- onboarding terminé ;
- informations essentielles présentes ;
- photos non floutées ;
- consentement promotionnel actif et non expiré ;
- réseau autorisé ;
- même consentement et même photo que lors de la création ;
- photo encore valide, appartenant au membre et stockée dans son dossier ;
- lien non révoqué et non expiré.

Le retrait ou le remplacement du consentement invalide donc immédiatement les
anciens liens, même si leurs lignes historiques restent conservées.

## Limites

- durée minimale : 1 heure ;
- durée maximale : 30 jours ;
- expiration jamais postérieure à celle du consentement ;
- au plus 20 liens encore valides par profil et par réseau ;
- motif de révocation : 500 caractères maximum ;
- jeton : 43 caractères base64 URL-safe.

## RPC

- `create_profile_promotion_share_link`
- `revoke_profile_promotion_share_link`
- `resolve_profile_promotion_share_link`
- `admin_list_profile_promotion_share_links`
- `admin_get_profile_promotion_share_status`

La fonction interne
`profile_promotion_share_eligibility_reason` centralise les règles
d’éligibilité.

Toutes les RPC exposées sont réservées à `service_role`. La validation du rôle
administrateur reste effectuée côté application avant la création du client
privilégié.

## Hors périmètre de cette PR

- interface des cartes administrateur ;
- boutons Facebook ou WhatsApp ;
- route `/promo/[token]` ;
- publication automatique via une API sociale ;
- campagne marketing ;
- migration Supabase Production ;
- activation ou modification de Vercel Production.

## Garde de livraison

La PR doit rester en Draft. La migration ne doit pas être appliquée à Supabase
Production sans autorisation explicite séparée.
