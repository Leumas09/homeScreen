Tu déploies le projet maroubra (dépôt `Leumas09/app-maroubra`) sur mon socle Azure kiwi-apps. Le code est prêt dans la PR #1 (branche `claude/gallant-lamport-7ear5n`) et ses tests sont verts. Le but est que `https://maroubra.apps.akakiwi.com` serve la version de cette PR, vérifiée de bout en bout. Ce n'est pas seulement que le déploiement passe.

## À lire d'abord

- Dépôt `Leumas09/app-maroubra` : `CLAUDE.md`, `docs/DEPLOY.md` (la procédure de référence), `infra/*.bicep` et `.github/workflows/deploy.yml`.
- Dépôt `Leumas09/platform` : `CLAUDE.md` et `docs/projet.md` (les règles du socle). Si la skill `/kiwi-apps` est installée, utilise-la.

## Règles non négociables

1. **Secrets.** Les trois secrets (mot de passe familial, clé de session, clé privée VAPID) ne passent jamais par toi. C'est moi qui les saisis ou les génère, dans un terminal à part.
   - Tu ne lis ni mes variables d'environnement, ni l'historique du shell, ni les secrets de la Container App (`az containerapp secret show`, `--show-values`).
   - Tu n'écris aucun secret dans un fichier, un commit ou la conversation.
2. **Connexions.** `az login` et `gh auth login`, c'est moi. Si une session manque, demande-la-moi.
3. **Ordre.** D'abord `az bicep build`, puis le what-if, puis un résumé en français, puis mon OK explicite. Cela vaut pour toute commande qui modifie Azure ou GitHub : déploiement, variables du dépôt, fusion de la PR.
4. **Socle.** Ne touche à rien dans `rg-kiwi-apps`, sauf les deux attributions de rôle sur `crkiwiapps` prévues par `infra/acr-roles.bicep`.
5. **Ressources.** Tag `project=maroubra` sur chaque ressource, tout en Bicep, aucune modification manuelle qui dériverait du Bicep.
6. **Doc Microsoft.** Avant chaque choix technique Azure nouveau, vérifie la doc Microsoft Learn à jour et cite la page.
7. **Rédaction.** Réponds en français, sans tiret cadratin.

## Étapes

### 1. Préparation (lecture seule)

- Clone le dépôt et prends la branche de la PR.
- `az account show` : tenant `ca1ed5b3-04c3-4eb0-9081-03490e38bc4f`, souscription `0f055e5f-3d37-4d3a-9ffa-574e4402001d`, compte `ops@samuelfondrillonlive328.onmicrosoft.com`.
- `gh auth status`.
- `npm ci && npm test` : tout doit passer.

### 2. Vérifications impossibles depuis l'environnement de développement

L'environnement de développement n'avait pas accès à l'API Azure : ces points n'ont jamais été vérifiés sur la cible. Vérifie-les maintenant, en lecture seule.

- **Socle.** `cae-kiwi-apps` existe en Australia East, avec le suffixe DNS `apps.akakiwi.com` et le certificat wildcard. `crkiwiapps` existe. Les deux sont dans `rg-kiwi-apps`.
- **Modèle.** `gpt-6.1-sol`, version `2026-09-29`, est disponible en Global Standard en `australiaeast` (`az cognitiveservices model list -l australiaeast`). Le quota couvre 20 000 jetons par minute (`az cognitiveservices usage list -l australiaeast`). Sinon, propose `modelCapacity=10` ou corrige `infra/ai.bicep`.
- **Identifiants GitHub.** `gh api repos/Leumas09/app-maroubra --jq '.owner.id, .id'`.
- **Sujet OIDC.** `infra/identities.bicep` attend le format immuable `repo:Leumas09@<ownerId>/app-maroubra@<repoId>:ref:refs/heads/main`. Vérifie dans la doc GitHub à jour, et avec `gh api repos/Leumas09/app-maroubra/actions/oidc/customization/sub`, que c'est bien ce que ce dépôt émet, et pas l'ancien `repo:Leumas09/app-maroubra:ref:refs/heads/main`. Corrige `infra/main.bicep` si besoin et dis-le-moi.

Si un point demande une correction :
1. corrige dans `infra/` sur la branche de la PR ;
2. relance `npm test` et `az bicep build` ;
3. commite en français, puis pousse sur la même branche.

### 3. Build et what-if

- `az bicep build --file infra/main.bicep` : aucune erreur, aucun avertissement.
- Lance le what-if de la section 3 de `docs/DEPLOY.md`. Pour les paramètres sécurisés (`appPassword`, `sessionSecret`, `vapidPrivateKey`) et `vapidPublicKey`, passe des valeurs factices évidentes, par exemple `whatif-only`. Le what-if ne montre jamais une valeur sécurisée, donc le plan est le même qu'avec les vraies.
- Fais un résumé en français : créations, modifications et suppressions, groupe par groupe. Signale tout ce qui toucherait `rg-kiwi-apps` en dehors des deux rôles sur l'ACR. Attends mon OK.

### 4. Déploiement de l'infra (après mon OK)

1. Écris un script hors du dépôt, `~/maroubra-deploy.sh`, qui :
   - lit le mot de passe familial sans l'afficher (`read -rs`) ;
   - génère la clé de session (`openssl rand -base64 48`) ;
   - génère les clés VAPID (`npx --yes web-push@3.6.7 generate-vapid-keys --json`) ;
   - lance `az deployment sub create --name app-maroubra` avec exactement les paramètres du what-if ;
   - efface les variables à la fin.
2. Montre-moi le script. C'est moi qui l'exécute, dans un terminal à part.
3. Ensuite, lis le résultat avec `az deployment sub show -n app-maroubra` et ses opérations en erreur.

Si le modèle échoue pour quota, propose de relancer avec `modelCapacity=10`.

### 5. Variables du dépôt (après mon OK)

- Pose les quatre variables avec les `gh variable set` de la section 5 de `docs/DEPLOY.md`.
- Vérifie que `gh secret list -R Leumas09/app-maroubra` est vide.

### 6. Contrôle avant fusion

Vérifie ces trois points sur `https://maroubra.apps.akakiwi.com`, qui sert encore l'image de démonstration :
- le site répond ;
- le certificat `*.apps.akakiwi.com` est valide ;
- le DNS pointe sur l'environnement.

### 7. Fusion et premier déploiement de l'app (après mon OK)

1. Fusionne la PR #1, puis suis le run `deploy` sur `main` avec `gh run watch`.
2. Si `azure/login` échoue parce qu'aucun crédential fédéré ne correspond (AADSTS700213 ou AADSTS70021), le message donne le sujet réel :
   - corrige le Bicep ;
   - refais what-if et OK, puis applique ;
   - relance avec `gh run rerun`.

   Pour cette correction, `infra/identities.bicep` peut être déployé seul dans `rg-app-maroubra`, sans repasser les secrets.
3. Pour toute autre erreur, trouve la cause dans les journaux. Ne relance pas à l'aveugle.

### 8. Vérifications finales

- Lance les commandes de la section 7 de `docs/DEPLOY.md`. `/health` doit servir le sha du commit fusionné.
- Toutes les sources doivent passer à `ok: true` dans les 10 minutes. Pour chaque source restée en erreur, donne la cause (journaux : `az containerapp logs show -n maroubra -g rg-app-maroubra`), puis corrige-la ou explique pourquoi elle ne peut pas l'être.
- Le brief doit être produit par `gpt-6.1-sol` et non par les règles de secours. Pour le vérifier, regarde dans les journaux les appels au modèle et leurs erreurs (rôle, point de terminaison, nom du déploiement).
- Je me connecterai moi-même avec le mot de passe pour confirmer l'affichage et les notifications.

### 9. Fin

- Mets à jour l'état dans `docs/PLAN.md`, et `docs/DEPLOY.md` si une étape a changé, par une nouvelle PR.
- Donne-moi un tableau final avec trois colonnes : ce qui marche, ce qui reste à faire, et pour chaque point la preuve (commande et résultat).
