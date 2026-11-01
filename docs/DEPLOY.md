# Déployer maroubra.apps.akakiwi.com

Ce guide suit la convention du socle (`docs/projet.md` du dépôt `Leumas09/platform`) et ses règles :

- Bicep, puis build et what-if, résumé en français, puis ton OK avant d'appliquer.
- Connexions interactives faites par toi.
- Aucun secret dans le dépôt.

Les secrets acceptés pour ce projet sont trois secrets de la Container App :

- le mot de passe familial ;
- la clé de signature des sessions ;
- la clé privée des notifications (VAPID).

## Ce qui sera créé

| Ressource | Nom | Rôle |
|---|---|---|
| Groupe | `rg-app-maroubra` | tout le projet, tag `project=maroubra` |
| Identité d'exécution | `id-maroubra-run` | tire l'image, écrit les tables, appelle le modèle |
| Identité de déploiement | `id-maroubra-ci` + crédential fédéré GitHub (branche `main`) | workflow en OIDC |
| Rôles sur l'ACR du socle | AcrPull (`run`), AcrPush (`ci`) | seule exception hors du groupe, description `project=maroubra` |
| Compte de stockage | `stmaroubra…` | tables `archive`, `push`, `votes` ; clé partagée désactivée ; rôle Storage Table Data Contributor pour `run` |
| Microsoft Foundry | `ai-maroubra-…` (AIServices) | déploiement `gpt-6.1-sol` (2026-09-29, Data Zone Standard Asie-Pacifique, 20 000 jetons/min) ; authentification locale désactivée ; rôle Cognitive Services OpenAI User pour `run` |
| Container App | `maroubra` dans `cae-kiwi-apps` | 1 réplica permanent, 0,5 vCPU / 1 Gio, 3 secrets, sondes `/health` ; rôle Container Apps Contributor pour `ci` sur l'app seule |

Sources Learn : voir les commentaires en tête de chaque fichier `infra/*.bicep` et la partie C de `docs/PLAN.md`.

## 0. Prérequis

Le dépôt s'appelle déjà `app-maroubra`. Le sujet OIDC contient son nom et son ID, et ce dépôt émet le format immuable (`use_immutable_subject: true`) :

```bash
gh api repos/Leumas09/app-maroubra --jq '.owner.id, .id'          # 15143848, 1432707561
gh api repos/Leumas09/app-maroubra/actions/oidc/customization/sub
```

Droits du compte `ops@` : la condition de son rôle Role Based Access Control Administrator doit autoriser Cognitive Services OpenAI User (`5e0bd9bd-7b93-4f28-af87-19fc36ad61bd`), en plus d'AcrPull, AcrPush, Container Apps Contributor et Storage Table Data Contributor. Sans lui, le what-if avec contrôle des droits échoue sur l'attribution de rôle du compte Foundry (ajouté par Samuel le 31/10/2026).

Quota du modèle : le quota Global Standard d'un modèle est un pool unique pour toute la souscription, toutes régions confondues ([Learn](https://learn.microsoft.com/azure/foundry/foundry-models/quotas-limits#subscription-level-quota-management)). Il est consommé par d'autres projets, d'où le déploiement en Data Zone Standard (paramètre `modelSku` de `infra/ai.bicep`). Pour vérifier :

```bash
az rest --method get --url "https://management.azure.com/subscriptions/0f055e5f-3d37-4d3a-9ffa-574e4402001d/providers/Microsoft.CognitiveServices/modelCapacities?api-version=2024-10-01&modelFormat=OpenAI&modelName=gpt-6.1-sol&modelVersion=2026-09-29" \
  --query "value[?location=='australiaeast'].{sku:properties.skuName, dispo:properties.availableCapacity}" -o table
```

## 1. Session Azure

```bash
az login --tenant ca1ed5b3-04c3-4eb0-9081-03490e38bc4f
az account set --subscription 0f055e5f-3d37-4d3a-9ffa-574e4402001d
az account show --query "{user:user.name, sub:id}" -o table
```

Le compte attendu est `ops@samuelfondrillonlive328.onmicrosoft.com`.

## 2. Les secrets, générés dans ton terminal (jamais copiés dans un fichier ni une conversation)

```bash
read -rs -p "Mot de passe familial : " APP_PASSWORD; echo
SESSION_SECRET=$(openssl rand -base64 48)
VAPID=$(npx --yes web-push@3.6.7 generate-vapid-keys --json)
VAPID_PUBLIC=$(echo "$VAPID" | jq -r .publicKey)
VAPID_PRIVATE=$(echo "$VAPID" | jq -r .privateKey)
OWNER_ID=15143848
REPO_ID=1432707561
```

Les secrets passent en arguments d'`az` : ils sont visibles dans la liste des processus de la session pendant le déploiement. Ne lance ni `ps` ni `Get-Process` avec la ligne de commande pendant ce temps, et suis le déploiement avec `az deployment sub show` uniquement.

## 3. Build et what-if

```bash
az bicep build --file infra/main.bicep
az deployment sub what-if --location australiaeast --template-file infra/main.bicep \
  --parameters githubOwner=Leumas09 githubOwnerId=$OWNER_ID githubRepoId=$REPO_ID \
               appPassword="$APP_PASSWORD" sessionSecret="$SESSION_SECRET" \
               vapidPublicKey="$VAPID_PUBLIC" vapidPrivateKey="$VAPID_PRIVATE"
```

Ce que le what-if doit annoncer au premier déploiement : **17 créations**, aucune modification ni suppression, aucun diagnostic. 15 dans `rg-app-maroubra` (groupe compris) et, dans `rg-kiwi-apps`, seulement les deux rôles sur `crkiwiapps`. Le build a été vérifié avec Bicep 0.48.1 : aucune erreur, aucun avertissement.

Si le what-if signale `NestedDeploymentShortCircuited`, un module reçoit une valeur calculée à l'exécution et ses ressources n'apparaissent pas : le plan est alors incomplet. Les modules lisent identités et stockage par `existing` pour l'éviter ([Learn](https://learn.microsoft.com/azure/azure-resource-manager/bicep/linter-rule-what-if-short-circuiting)).

Pour les paramètres sécurisés et `vapidPublicKey`, des valeurs factices (`whatif-only`) suffisent au what-if : il ne montre jamais une valeur sécurisée.

## 4. Déploiement (après ton OK sur le what-if)

```bash
az deployment sub create --location australiaeast --name app-maroubra --template-file infra/main.bicep \
  --parameters githubOwner=Leumas09 githubOwnerId=$OWNER_ID githubRepoId=$REPO_ID \
               appPassword="$APP_PASSWORD" sessionSecret="$SESSION_SECRET" \
               vapidPublicKey="$VAPID_PUBLIC" vapidPrivateKey="$VAPID_PRIVATE"
```

**Si le déploiement du modèle échoue pour quota**, vérifie la capacité disponible (étape 0) : `modelCapacity=10` ne sert que s'il reste de la place dans le pool. Le brief et le tri des actualités consomment très peu.

Le premier déploiement a duré 16 min 40 s le 31/10/2026 : l'environnement `cae-kiwi-apps` a renvoyé `ManagedClusterSuspended` pendant la création de l'app, puis s'est rétabli seul. Ne pas interrompre un déploiement en cours (constat 1 du test `smoke` du socle).

## 5. Variables du dépôt (pas des secrets)

```bash
gh variable set AZURE_CLIENT_ID --body "$(az deployment sub show -n app-maroubra --query properties.outputs.ciClientId.value -o tsv)" -R Leumas09/app-maroubra
gh variable set AZURE_TENANT_ID --body ca1ed5b3-04c3-4eb0-9081-03490e38bc4f -R Leumas09/app-maroubra
gh variable set AZURE_SUBSCRIPTION_ID --body 0f055e5f-3d37-4d3a-9ffa-574e4402001d -R Leumas09/app-maroubra
gh variable set APP_NAME --body maroubra -R Leumas09/app-maroubra
gh secret list -R Leumas09/app-maroubra   # doit être vide
```

## 6. Mise en ligne

Fusionner la branche de développement dans `main`. Le workflow `deploy` lance les tests, construit l'image, la pousse dans `crkiwiapps`, met l'app à jour, puis vérifie que `https://maroubra.apps.akakiwi.com/health` sert bien la version du commit.

**Au premier passage, l'étape « Vérification du déploiement » échoue, et c'est attendu.** L'infra a été créée avec l'image de démonstration : `project.bicep` règle alors l'ingress sur le port 80, sans sondes. `az containerapp update --image` change seulement l'image, donc la nouvelle révision reste en `Activating` (l'app écoute sur 8080). Correction, sans rien modifier à la main :

1. Redéployer l'infra (étape 4) en ajoutant `containerImage=crkiwiapps.azurecr.io/maroubra:<sha du premier run>`, après what-if et OK. Le what-if annonce alors `targetPort` 80 vers 8080 et l'ajout des sondes. Les paramètres sécurisés sont à repasser, donc la clé de session et les clés VAPID sont régénérées.
2. Relancer le job en échec : `gh run rerun <id> -R Leumas09/app-maroubra --failed`.

Les déploiements suivants du workflow n'ont plus ce problème.

## 7. Vérifications

```bash
curl -s https://maroubra.apps.akakiwi.com/health | jq '{status, version, sources: (.sources | map_values(.ok))}'
echo | openssl s_client -servername maroubra.apps.akakiwi.com -connect maroubra.apps.akakiwi.com:443 2>/dev/null | openssl x509 -noout -subject -issuer
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://maroubra.apps.akakiwi.com/   # 303 vers /login
```

Dans `/health`, chaque source doit passer à `ok: true` dans les minutes qui suivent. Une source restée à `false` affiche son erreur, sans bloquer les autres.

## Plus tard

- **Redéployer l'infra** : passer `containerImage=crkiwiapps.azurecr.io/maroubra:<sha en place>`, sinon l'app repart sur l'image de démonstration. Il faut aussi repasser les secrets (paramètres sécurisés).
- **Changer le mot de passe** : redéployer avec un nouveau `appPassword`, ou `az containerapp secret set -n maroubra -g rg-app-maroubra --secrets app-password=<nouveau>`, puis redémarrer la révision. Les sessions existantes sont alors invalidées.
- **Supprimer le projet** : procédure de `docs/projet.md` du socle (rôles ACR, images, groupe, archivage du dépôt).
