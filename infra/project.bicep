// Container App « maroubra » et droit de mise à jour de la CI sur elle seule.
// Déployée après acr-roles.bicep : sans AcrPull, Container Apps ne peut pas configurer le registre.
// Un seul réplica, toujours actif : les collecteurs tiennent l'état en mémoire et ne doivent pas tourner en double.
// Learn : https://learn.microsoft.com/azure/container-apps/scale-app#scale-definition
//         https://learn.microsoft.com/azure/container-apps/manage-secrets#referencing-secrets-in-environment-variables
param name string
param location string
param tags object
param containerImage string
param environmentId string
param registryServer string
param runIdentityName string
param ciIdentityName string
param storageName string
param foundryEndpoint string
param foundryDeployment string
@secure()
param appPassword string
@secure()
param sessionSecret string
param vapidPublicKey string
@secure()
param vapidPrivateKey string
param vapidSubject string

// Identités et stockage lus par `existing` : un paramètre de module calculé à l'exécution court-circuite le what-if.
// Learn : https://learn.microsoft.com/azure/azure-resource-manager/bicep/linter-rule-what-if-short-circuiting
resource runIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' existing = {
  name: runIdentityName
}

resource ciIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' existing = {
  name: ciIdentityName
}

resource storage 'Microsoft.Storage/storageAccounts@2026-06-01' existing = {
  name: storageName
}

var containerAppsContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '358470bc-b998-42bd-ab17-a7e34c199c0f')
// L'image de démonstration écoute sur le port 80, l'app sur 8080.
var isDemoImage = startsWith(containerImage, 'mcr.microsoft.com/')

resource app 'Microsoft.App/containerApps@2026-07-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${runIdentity.id}': {}
    }
  }
  properties: {
    environmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: isDemoImage ? 80 : 8080
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: registryServer
          identity: runIdentity.id
        }
      ]
      secrets: [
        { name: 'app-password', value: appPassword }
        { name: 'session-secret', value: sessionSecret }
        { name: 'vapid-private-key', value: vapidPrivateKey }
      ]
    }
    template: {
      containers: [
        {
          name: name
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'PORT', value: '8080' }
            { name: 'APP_PASSWORD', secretRef: 'app-password' }
            { name: 'SESSION_SECRET', secretRef: 'session-secret' }
            { name: 'VAPID_PRIVATE_KEY', secretRef: 'vapid-private-key' }
            { name: 'VAPID_PUBLIC_KEY', value: vapidPublicKey }
            { name: 'VAPID_SUBJECT', value: vapidSubject }
            { name: 'AZURE_CLIENT_ID', value: runIdentity.properties.clientId }
            { name: 'TABLE_ENDPOINT', value: storage.properties.primaryEndpoints.table }
            { name: 'FOUNDRY_ENDPOINT', value: foundryEndpoint }
            { name: 'FOUNDRY_DEPLOYMENT', value: foundryDeployment }
          ]
          probes: isDemoImage ? [] : [
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 8080 }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/health', port: 8080 }
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

// Droit de mise à jour sur la seule Container App du projet.
resource ciAppRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: app
  name: guid(app.id, 'id-${name}-ci', containerAppsContributor)
  properties: {
    roleDefinitionId: containerAppsContributor
    principalId: ciIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'CI ${name} : mise à jour de la Container App'
  }
}
