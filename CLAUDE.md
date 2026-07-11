# Instructions permanentes — KASSALAFAM

## Projet

KASSALAFAM — MARIAGE À TOUT PRIX est une plateforme matrimoniale orientée vers les relations sérieuses, la confidentialité, la vérification des profils et la sécurité des membres.

Domaine de Production :

`https://kassalafam.com`

Dépôt local Windows habituel :

`C:\Users\USER\Projects\kassalafam-mariage-a-tout-prix`

Projet Supabase Production :

`cmifejrcnvixwbxhzdpx`

Ne jamais utiliser les identifiants Production dans un autre projet.

## Stack technique

- Next.js avec App Router
- React
- TypeScript strict
- Tailwind CSS
- Supabase :
  - PostgreSQL
  - Auth
  - Storage
  - Realtime
  - Row Level Security
  - fonctions PostgreSQL et RPC
- migrations gérées avec Supabase CLI
- tests PostgreSQL avec pgTAP lorsque pertinent
- déploiement sur Vercel
- domaine canonique : `https://kassalafam.com`

Particularité Windows : exécuter `npm run build` et `npm run lint` depuis le chemin en majuscules (`C:\Users\USER\...`), sinon le prérendu échoue (casse du chemin).

## Principes de développement

- Utiliser les Server Components par défaut.
- Ajouter `"use client"` uniquement lorsque l’état client, les hooks React, les événements navigateur ou une API Web l’exigent.
- Réutiliser les composants, fonctions, types, helpers et styles existants avant d’en créer de nouveaux.
- Respecter l’architecture, les conventions de nommage et la charte visuelle existantes.
- Ne pas réécrire un fichier entier pour une modification locale.
- Produire des changements minimaux, ciblés et faciles à relire.
- Ne pas ajouter de dépendance sans justification technique et autorisation explicite.
- Éviter les abstractions prématurées.
- Ne pas ajouter de code inutilisé.
- Ne pas corriger spontanément des problèmes hors périmètre.
- Signaler séparément les anomalies découvertes sans les modifier.

## Économie de tokens

- Rester concis.
- Ne pas recopier des fichiers entiers lorsqu’un diff ou un extrait ciblé suffit.
- Ne pas réexpliquer longuement du code évident.
- Pour une modification simple, montrer uniquement :
  - le fichier concerné ;
  - le changement ciblé ;
  - les contrôles effectués.
- Ne pas produire de longs résumés répétitifs.
- Pour les opérations sensibles, rester concis mais fournir toutes les preuves nécessaires.

## Sécurité des données

- Ne jamais contourner les règles RLS.
- Ne jamais désactiver RLS pour résoudre rapidement un problème.
- Ne jamais exposer dans le client :
  - une clé `service_role` ;
  - un secret ;
  - un token privé ;
  - une clé VAPID privée ;
  - un identifiant administratif ;
  - des données personnelles non nécessaires.
- Ne jamais afficher publiquement :
  - le nom complet d’un membre ;
  - son courriel ;
  - son téléphone ;
  - sa date de naissance complète ;
  - ses messages ;
  - ses intérêts ;
  - ses matchs ;
  - ses signalements ;
  - ses données de modération.
- Ne pas utiliser l’UUID Supabase d’un membre dans une URL publique.
- Toute fonctionnalité publique de partage de profil doit utiliser un identifiant opaque, sécurisé et révocable.
- Respecter les réglages de floutage et de confidentialité des photos.
- Exiger un consentement explicite du membre avant toute publication ou diffusion publique de son profil.
- Un administrateur ne doit jamais pouvoir contourner le consentement du membre.

## Supabase et migrations

- Toute modification du schéma doit passer par une nouvelle migration versionnée.
- Ne jamais modifier une migration déjà appliquée.
- Ne jamais appliquer une migration en Production sans autorisation explicite.
- Ne jamais lancer une écriture directe en Production sans autorisation explicite.
- Ne jamais supprimer des données Production sans :
  1. audit préalable en lecture seule ;
  2. sélection exacte ;
  3. vérification du nombre de lignes ;
  4. autorisation explicite ;
  5. contrôle après suppression.
- Utiliser des RPC `SECURITY DEFINER` uniquement lorsque cela est réellement nécessaire.
- Pour chaque RPC `SECURITY DEFINER` :
  - fixer explicitement le `search_path` ;
  - vérifier l’identité de l’utilisateur ;
  - appliquer des permissions minimales ;
  - limiter les `GRANT` ;
  - tester les cas autorisés et interdits.
- Ajouter des tests pgTAP pour :
  - permissions ;
  - RLS ;
  - fonctions ;
  - cas d’erreur ;
  - idempotence ;
  - sécurité des données.
- Ne jamais utiliser une clé `service_role` dans le navigateur.

## Authentification et autorisations

- Vérifier les autorisations côté serveur.
- Ne pas se fier uniquement à l’interface pour protéger une action.
- Distinguer clairement :
  - membre ;
  - administrateur ;
  - super administrateur.
- Vérifier les allowlists administratives existantes avant d’ajouter une nouvelle logique de rôle.
- Ne jamais rendre une action administrative accessible par simple masquage visuel.
- Valider les redirections pour éviter les redirections ouvertes.
- Ne pas exposer les sessions, cookies ou jetons dans les rapports.

## Messagerie

- La messagerie est autorisée uniquement entre les participants d’un match accepté.
- Ne pas modifier la messagerie lorsqu’elle n’est pas explicitement dans le périmètre.
- Ne pas créer de nouveaux messages de test sans autorisation.
- Ne pas supprimer de messages sans procédure contrôlée.
- Préserver :
  - les règles RLS ;
  - les fonctions `send_message` ;
  - les contrôles de match accepté ;
  - le marquage comme lu ;
  - Supabase Realtime ;
  - les mécanismes de blocage et signalement.
- Ne jamais afficher le contenu d’un message dans une notification Push sur écran verrouillé par défaut.

## Notifications

- `member_notifications` reste la source de vérité des notifications internes.
- Une notification Push doit rester un canal de livraison secondaire.
- Ne pas rendre une fonctionnalité métier dépendante de la réussite d’un Push.
- Ne pas implémenter les notifications Push sans phase dédiée et validation d’architecture.
- Les notifications Push sont une fonctionnalité de feuille de route, non prioritaire actuellement.
- Les premiers événements Push, lorsqu’ils seront développés, devront être limités à :
  - nouveau message ;
  - nouvel intérêt ;
  - intérêt accepté ;
  - mise à jour de vérification ;
  - sécurité du compte.
- Ne pas ajouter de campagnes marketing Push sans demande explicite.

## Partage de profils

Pour toute future fonctionnalité de partage de profil :

- exiger le consentement explicite du membre ;
- permettre le retrait immédiat du consentement ;
- désactiver automatiquement les liens lors du retrait ;
- utiliser des liens opaques ;
- prévoir expiration et révocation ;
- ne jamais exposer l’UUID du profil ;
- ne jamais exposer de coordonnées directes ;
- ne jamais exposer de données administratives ;
- vérifier à chaque consultation :
  - profil approuvé ;
  - compte actif ;
  - consentement actif ;
  - lien non expiré ;
  - lien non révoqué ;
  - absence de suspension ;
  - absence de restriction de modération ;
  - conformité de la photo.
- afficher uniquement une présentation limitée :
  - prénom ;
  - âge calculé ;
  - ville ;
  - pays ;
  - intention matrimoniale ;
  - univers matrimonial ;
  - courte biographie ;
  - badge de vérification ;
  - photo autorisée ou floutée.
- ne pas permettre de contact direct depuis la page publique.

## Git

Avant toute tâche, vérifier :

```bash
git branch --show-current
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git stash list
```

- Le dépôt doit être propre avant de commencer ; en cas d’écart avec l’état attendu, s’arrêter et présenter l’écart sans rien modifier.
- Ne jamais synchroniser `main` automatiquement : un fast-forward ne se fait que sur autorisation explicite.
- Développer sur une branche dédiée par fonctionnalité ; ne jamais commiter directement sur `main`.
- Ne créer aucun commit, aucune branche, aucun push, aucune PR et aucun merge sans autorisation explicite de l’utilisateur — chaque étape est validée séparément.
- Ne jamais utiliser `--force`, ne jamais réécrire l’historique publié, ne jamais amender un commit poussé.
- Ne jamais appliquer, supprimer ou modifier un stash sans instruction explicite.
- Les PR sont fusionnées via merge commit GitHub (historique de PR conservé) ; la suppression des branches fusionnées (locale et distante) se fait sur instruction.
- Vercel déploie automatiquement `main` en Production au merge : ne jamais déclencher de déploiement manuel sans autorisation explicite.
- Après un merge autorisé, resynchroniser le local avec `git pull --ff-only` puis vérifier `HEAD = origin/main`, arbre propre, stash vide.

## Commits et pull requests

Avant tout commit, exécuter séparément :

- `git status --short --branch`
- `git diff --name-only`
- `git diff --check`
- `git diff --stat`
- `git diff`

Après validation :

- ajouter uniquement les fichiers autorisés ;
- créer un seul commit cohérent ;
- utiliser un message court et descriptif ;
- vérifier le commit avec `git show --stat --oneline HEAD` ;
- vérifier le commit avec `git diff HEAD^ HEAD --check` ;
- ne pas ajouter automatiquement de trailer, signature ou mention publicitaire non demandée ;
- ne pas ajouter « Generated with Claude Code » dans une PR sauf instruction explicite ;
- ne jamais pousser `main` directement lorsqu’une PR est attendue ;
- ne jamais merger une PR dont les checks obligatoires ne sont pas réussis.

## Validation du code

Après toute modification de code, exécuter séparément :

- `git diff --check`
- `npm run lint`
- `npm run build`

Lorsque le lint global échoue à cause de fichiers locaux non suivis ou hors projet :

- ne pas modifier la configuration sans autorisation ;
- exécuter un lint ciblé sur les fichiers modifiés ;
- signaler clairement le résultat global, le résultat ciblé et la cause de l’écart.

Pour toute fonctionnalité importante, vérifier lorsque pertinent :

- TypeScript ;
- ESLint ;
- build Next.js ;
- rendu mobile ;
- erreurs console et réseau ;
- autorisations RLS ;
- persistance ;
- absence de doublons ;
- comportement après rechargement ;
- routes publiques et protégées ;
- métadonnées Open Graph ;
- accessibilité minimale.

Dans l’environnement Windows local actuel de ce dépôt, exécuter les commandes npm depuis `C:\Users\USER\Projects\kassalafam-mariage-a-tout-prix`, car des problèmes de prérendu ont déjà été constatés lorsque la casse du chemin différait.

## Validation Production

Ne jamais considérer une fonctionnalité comme terminée uniquement parce que le build réussit.

Avant de déclarer une phase terminée :

- vérifier la PR ;
- vérifier le commit déployé ;
- vérifier le statut Vercel ;
- vérifier l’environnement Preview ou Production demandé ;
- tester les routes concernées ;
- confirmer les réponses HTTP ;
- vérifier l’absence d’erreurs visibles ;
- vérifier l’absence de régression ;
- confirmer que les données attendues sont réellement servies.

Ne jamais déclencher un déploiement Production manuel lorsque le workflow Git doit le faire automatiquement.

## Utilisation du navigateur

Pour les tests avec plusieurs comptes :

- utiliser des profils navigateur réellement indépendants ;
- ne pas utiliser deux onglets du même profil pour deux utilisateurs différents ;
- ne pas changer de compte pendant un test ;
- ne pas exposer les mots de passe, cookies, tokens ou sessions ;
- effectuer un seul appel navigateur à la fois lorsque plusieurs sessions sont connectées ;
- ne pas recharger pendant un test Realtime sauf lorsque le protocole le demande ;
- distinguer les erreurs de l’application des limitations de l’outil navigateur ;
- vérifier explicitement quel navigateur correspond à chaque utilisateur avant toute action ;
- ne jamais envoyer de message, accepter un intérêt, bloquer ou signaler un profil sans autorisation explicite ;
- lorsqu’un test visuel est bloqué par Vercel SSO ou une limitation de l’outil, le signaler clairement sans prétendre que le test a été exécuté.

## Style de réponse

- Rester concis et opérationnel.
- Ne pas ajouter de blabla inutile après le code.
- Pour une petite modification, fournir uniquement :
  - le fichier concerné ;
  - le changement ciblé ;
  - les commandes utiles ;
  - les résultats des contrôles.
- Pour un audit, une migration, une PR, un merge, une suppression Production ou un déploiement, fournir un rapport bref mais complet.
- Toujours distinguer :
  - ce qui a été constaté ;
  - ce qui a été modifié ;
  - ce qui n’a pas été modifié ;
  - ce qui reste à faire.
- Ne jamais déclarer une action réussie sans preuve issue d’une commande, d’un test ou d’un outil.
- Ne pas masquer les erreurs.
- Ne pas prétendre qu’un test visuel a été exécuté lorsqu’il ne l’a pas été.
- Signaler les limitations de l’outil.
- Ne pas produire de longs résumés répétitifs.
- Pour les opérations sensibles, rester concis mais fournir toutes les preuves nécessaires.
- S’arrêter aux points de contrôle demandés.
- Attendre l’autorisation explicite avant l’étape suivante.

## Protection du périmètre

- Ne toucher qu’aux fichiers explicitement liés à la tâche.
- Ne pas modifier la messagerie, les migrations, les rôles, l’administration, les données, les notifications ou le partage lorsqu’ils ne font pas partie du périmètre demandé.
- Ne pas lancer de refactorisation générale pendant un correctif local.
- Ne pas mettre à jour les dépendances pendant une tâche non liée.
- Ne pas modifier les secrets ou variables Vercel sans autorisation explicite.
- Ne pas modifier les paramètres Supabase Auth sans autorisation explicite.
- Ne pas modifier le domaine canonique.
- Ne pas appliquer de correction automatique à un problème hors périmètre.
- Signaler les problèmes hors périmètre dans une section séparée.
- Lorsqu’un fichier inattendu apparaît dans le diff, arrêter l’opération avant commit.
- Ne jamais élargir une suppression de données au-delà des identifiants et critères explicitement validés.

## Priorités produit actuelles

Ordre de priorité recommandé :

1. partage sécurisé des profils depuis l’administration ;
2. amélioration de l’onboarding et du taux de profils complets ;
3. acquisition de nouveaux membres ;
4. paiements et formule Premium ;
5. notifications Push ;
6. Coach IA et fonctionnalités avancées.

Les notifications Push sont utiles et recommandées pour KASSALAFAM, mais elles ne doivent pas être développées maintenant sans instruction explicite.

Le partage sécurisé des profils reste le prochain chantier prioritaire envisagé.

## État fonctionnel de référence

À la date actuelle :

- les mentions légales officielles sont publiées en Production ;
- TITANEX SARL est identifiée comme éditeur et responsable du traitement ;
- le RCCM publié est `CM-DLA-02-2026-B13-00145` ;
- le NIU publié est `M022618389246M` ;
- la messagerie réelle A↔B a été validée en Production avec deux sessions indépendantes ;
- le temps réel bidirectionnel, la persistance, l’ordre des messages, l’aperçu du dernier message et le marquage comme lu ont été validés ;
- les trois messages du test réel ont été supprimés de façon contrôlée ;
- la table `messages` est revenue à son état initial ;
- le match de test reste accepté et intact ;
- aucun message de test ne doit être recréé sans autorisation explicite ;
- le prochain chantier envisagé est le partage sécurisé de profils par l’administrateur ;
- les notifications Push restent prévues pour une phase ultérieure.

Ne jamais considérer cet état comme immuable.

Avant toute opération sensible, vérifier l’état réel de :

- Git ;
- GitHub ;
- Vercel ;
- Supabase ;
- Production ;
- données concernées.
