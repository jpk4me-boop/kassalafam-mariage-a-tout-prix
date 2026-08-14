# `docs/journal` — mémoire opérationnelle du projet

Ces documents ne sont ni de la documentation produit, ni des spécifications :
ce sont les **comptes rendus vérifiés** des chantiers en cours et des incidents
passés. Ils ont vécu jusqu'au 14/08/2026 hors du dépôt, dans les fichiers d'un
projet Claude — donc sans historique, sans sauvegarde et sans diff. Ils sont
versionnés depuis.

| Fiche | Objet | Fait foi sur |
|---|---|---|
| `memoire-projet.md` | état général, livraisons, points ouverts, méthode | l'état du projet à sa date de révision |
| `fiche-lot-c-sebpay.md` | pilote SebPay, blocage 403, allowlist IP | tout le sujet SebPay |
| `fiche-banc-pgtap.md` | banc d'essai pgTAP sans Docker | l'état du banc |
| `fiche-notifications-whatsapp.md` | notifications WhatsApp aux membres | les deux chemins, simple et automatique |

## Les trois règles qui les rendent utiles

1. **Git et les migrations font foi**, jamais la fiche. Une fiche est un
   compte rendu daté : elle périme. En cas de contradiction avec le dépôt ou la
   base, c'est le dépôt et la base qui gagnent, et c'est la fiche qu'on corrige.
2. **Une mémoire écrite le matin est périmée le soir.** Rouvrir une session par
   l'audit Git + Vercel + Supabase, jamais par la lecture d'une fiche. La rév. 48
   de la mémoire annonçait ouvertes trois PR déjà mergées.
3. **Ce qui n'a pas été vérifié est annoncé comme non vérifié.** Chaque fiche
   distingue explicitement ce qui a été constaté de ce qui est supposé. Une
   alerte non vérifiée traîne des révisions durant et peut être fausse — c'est
   arrivé sur `discover_candidates`.

## Mise à jour

À la fin d'un lot, dans la même PR que le lot quand c'est possible. Une fiche
mise à jour trois jours après le fait est une fiche que personne ne croira plus.

`memoire-projet.md` a une seconde destination : son contenu est aussi collé
dans les **instructions du projet Claude**. Mettre à jour le fichier sans les
instructions laisse l'ancienne version resservir à la session suivante.
