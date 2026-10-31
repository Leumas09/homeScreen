// Infra du projet maroubra sur le socle apps.akakiwi.com (convention : docs/projet.md du dépôt platform).
// Portée souscription. Les commandes exactes, avec la génération des secrets, sont dans docs/DEPLOY.md.
// Ordre : identités, puis rôles sur l'ACR, puis stockage et Foundry (et leurs rôles), puis Container App.
targetScope = 'subscription'

@description('Nom du projet : groupe rg-app-<nom>, identités id-<nom>-*, app <nom>, URL <nom>.apps.akakiwi.com.')
@minLength(2)
@maxLength(24)
param name string = 'maroubra'

@description('Propriétaire GitHub du dépôt.')
param githubOwner string

@description('Nom du dépôt GitHub (convention du socle : app-<nom>).')
param githubRepo string = 'app-${name}'

// Les dépôts créés après le 15/07/2026 présentent un sujet OIDC immuable :
// repo:<owner>@<ownerId>/<repo>@<repoId>:ref:refs/heads/main. Valeurs : gh api repos/<owner>/<repo> --jq '.owner.id, .id'
@description('ID numérique du propriétaire GitHub.')
param githubOwnerId string

@description('ID numérique du dépôt.')
param githubRepoId string

@description('Région du projet.')
param location string = 'australiaeast'

@description('Image de l\'app. Par défaut, l\'image de démonstration, en attendant le premier build.')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Mot de passe familial (secret de la Container App).')
@secure()
param appPassword string

@description('Clé de signature des sessions, 32 octets aléatoires ou plus.')
@secure()
param sessionSecret string

@description('Clé publique VAPID des notifications (pas un secret).')
param vapidPublicKey string

@description('Clé privée VAPID des notifications.')
@secure()
param vapidPrivateKey string

param vapidSubject string = 'mailto:samuel.fondrillon@gmail.com'

@description('Capacité du déploiement gpt-6.1-sol, en milliers de jetons par minute.')
param modelCapacity int = 20

@description('Socle : groupe, environnement Container Apps et registre.')
param platform object = {
  resourceGroup: 'rg-kiwi-apps'
  environment: 'cae-kiwi-apps'
  registry: 'crkiwiapps'
}

var tags = {
  project: name
}

// Noms calculés ici, connus avant le déploiement : les modules lisent les identités et le stockage par `existing`
// au lieu de recevoir des sorties d'autres modules, qui court-circuiteraient le what-if.
// Learn : https://learn.microsoft.com/azure/azure-resource-manager/bicep/linter-rule-what-if-short-circuiting
var rgName = 'rg-app-${name}'
var runIdentityName = 'id-${name}-run'
var ciIdentityName = 'id-${name}-ci'
var storageName = take('st${name}${uniqueString(rg.id)}', 24)
var aiAccountName = 'ai-${name}-${uniqueString(rg.id)}'
var modelName = 'gpt-6.1-sol'

resource rg 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: rgName
  location: location
  tags: tags
}

module identities 'identities.bicep' = {
  name: 'identities-${name}'
  scope: rg
  params: {
    name: name
    location: location
    tags: tags
    githubSubject: 'repo:${githubOwner}@${githubOwnerId}/${githubRepo}@${githubRepoId}:ref:refs/heads/main'
  }
}

// Seules ressources du projet hors de son groupe : ses rôles sur l'ACR du socle.
module acrRoles 'acr-roles.bicep' = {
  name: 'acr-roles-${name}'
  scope: resourceGroup(platform.resourceGroup)
  params: {
    registryName: platform.registry
    identityResourceGroup: rgName
    runIdentityName: runIdentityName
    ciIdentityName: ciIdentityName
    projectName: name
  }
  dependsOn: [
    identities
  ]
}

module data 'data.bicep' = {
  name: 'data-${name}'
  scope: rg
  params: {
    name: name
    location: location
    tags: tags
    storageName: storageName
    runIdentityName: runIdentityName
  }
  dependsOn: [
    identities
  ]
}

module ai 'ai.bicep' = {
  name: 'ai-${name}'
  scope: rg
  params: {
    name: name
    location: location
    tags: tags
    accountName: aiAccountName
    runIdentityName: runIdentityName
    modelName: modelName
    modelCapacity: modelCapacity
  }
  dependsOn: [
    identities
  ]
}

module project 'project.bicep' = {
  name: 'project-${name}'
  scope: rg
  params: {
    name: name
    location: location
    tags: tags
    containerImage: containerImage
    environmentId: resourceId(subscription().subscriptionId, platform.resourceGroup, 'Microsoft.App/managedEnvironments', platform.environment)
    registryServer: '${platform.registry}${environment().suffixes.acrLoginServer}'
    runIdentityName: runIdentityName
    ciIdentityName: ciIdentityName
    storageName: storageName
    foundryEndpoint: 'https://${aiAccountName}.openai.azure.com'
    foundryDeployment: modelName
    appPassword: appPassword
    sessionSecret: sessionSecret
    vapidPublicKey: vapidPublicKey
    vapidPrivateKey: vapidPrivateKey
    vapidSubject: vapidSubject
  }
  dependsOn: [
    acrRoles
    data
    ai
  ]
}

output appUrl string = 'https://${name}.apps.akakiwi.com'
output ciClientId string = identities.outputs.ciClientId
output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
