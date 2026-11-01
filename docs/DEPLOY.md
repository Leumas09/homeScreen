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
| Microsoft Foundry | `ai-maroubra-…` (AIServices) | déploiement `gpt-6.1-sol` (2026-09-29, Global Standard, 20 000 jetons/min) ; authentification locale désactivée ; rôle Cognitive Services OpenAI User pour `run` |
| Container App | `maroubra` dans `cae-kiwi-apps` | 1 réplica permanent, 0,5 vCPU / 1 Gio, 3 secrets, sondes `/health` ; rôle Container Apps Contributor pour `ci` sur l'app seule |

Sources Learn : voir les commentaires en tête de chaque fichier `infra/*.bicep` et la partie C de `docs/PLAN.md`.

## 0. Le dépôt

La convention du socle veut un dépôt `app-<nom>`. Le plus simple est de renommer ce dépôt **avant** de créer l'infra, car le sujet OIDC contient le nom et l'ID du dépôt :

```bash
gh repo rename app-maroubra -R Leumas09/homeScreen
gh api repos/Leumas09/app-maroubra --jq '.owner.id, .id'
```

Si tu préfères garder `homeScreen`, ajoute `githubRepo=homeScreen` aux paramètres des étapes 3 et 4.

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
OWNER_ID=<owner id de l'étape 0>
REPO_ID=<repo id de l'étape 0>
```

## 3. Build et what-if

```bash
az bicep build --file infra/main.bicep
az deployment sub what-if --location australiaeast --template-file infra/main.bicep \
  --parameters githubOwner=Leumas09 githubOwnerId=$OWNER_ID githubRepoId=$REPO_ID \
               appPassword="$APP_PASSWORD" sessionSecret="$SESSION_SECRET" \
               vapidPublicKey="$VAPID_PUBLIC" vapidPrivateKey="$VAPID_PRIVATE"
```

Ce que le what-if doit annoncer : 15 créations environ et aucune modification ni suppression dans `rg-kiwi-apps`, hormis l'ajout des deux rôles sur `crkiwiapps`. Le build a été vérifié avec Bicep 0.48.1 : aucune erreur, aucun avertissement.

## 4. Déploiement (après ton OK sur le what-if)

```bash
az deployment sub create --location australiaeast --name app-maroubra --template-file infra/main.bicep \
  --parameters githubOwner=Leumas09 githubOwnerId=$OWNER_ID githubRepoId=$REPO_ID \
               appPassword="$APP_PASSWORD" sessionSecret="$SESSION_SECRET" \
               vapidPublicKey="$VAPID_PUBLIC" vapidPrivateKey="$VAPID_PRIVATE"
```

**Si le déploiement du modèle échoue pour quota**, relance avec `modelCapacity=10`. Le brief et le tri des actualités consomment très peu.

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
