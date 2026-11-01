# Projet maroubra (`app-maroubra`)

Écran ambiant de la famille sur la mer, le ciel, la plage et la météo de Maroubra, en anglais, pour ordinateur, tablette et téléphone.
Hébergé sur le socle kiwi-apps : Container App `maroubra` dans `cae-kiwi-apps`, servie sur `https://maroubra.apps.akakiwi.com`.

Pour créer, déployer, faire évoluer ou supprimer ce projet, utiliser la skill `/kiwi-apps`. La convention est dans `docs/projet.md` du dépôt `Leumas09/platform`. Le déploiement pas à pas est dans `docs/DEPLOY.md`, le plan et l'état du projet dans `docs/PLAN.md`.

## Structure

| Dossier | Rôle |
|---|---|
| `apps/hub` | serveur Node (Hono) : mot de passe familial, flux temps réel, collecteurs, calculs dérivés, notifications |
| `apps/web` | app React (PWA), servie par le hub |
| `packages/sky` | éphémérides locales, vérifiées contre Skyfield + JPL DE421 |
| `packages/core` | formats partagés hub et app |
| `bench` | banc de vérification Python (modèles contre observations, marée harmonique) |
| `infra` | Bicep du projet |

Commandes : `npm test` (tous les tests), `apps/hub/scripts/demo.sh start` (hubs de démonstration hors ligne sur 8100 et 8101), `node apps/web/e2e/views.cjs <dossier>` (captures de toutes les vues).

## Règles

- Secrets acceptés par Samuel : mot de passe familial, clé de session, clé privée VAPID, uniquement comme secrets de la Container App. Jamais dans le dépôt, ni dans les tests (mot de passe de test : `test-family-password`).
- Tout en Bicep (`infra/`). Pour chaque déploiement : build, what-if, résumé en français, puis OK de Samuel avant d'appliquer.
- Tag `project=maroubra` sur chaque ressource, dans `rg-app-maroubra`. Ne jamais modifier le socle `rg-kiwi-apps`.
- Chaque prévision affichée a un juge extérieur (observation, référence indépendante) ; un objectif manqué reste visible dans le Track record.
- Interface en anglais ; documentation et code commentés en français, sans tiret cadratin.
