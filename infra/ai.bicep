// Microsoft Foundry : compte AIServices et déploiement du modèle gpt-6.1-sol (Data Zone Standard
// Asie-Pacifique, disponible en Australia East, sans demande d'accès). Appelé par l'identité managée
// de l'app, sans clé : authentification locale désactivée.
// Data Zone Standard plutôt que Global Standard : le quota Global Standard d'un modèle est un pool
// unique pour toute la souscription, toutes régions confondues, et il est déjà consommé par d'autres
// projets (capacité disponible 0 au 31/10/2026). Le quota Data Zone est séparé, par zone de données,
// et le traitement reste en Asie-Pacifique.
// Learn : https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure#gpt-61
//         https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability#data-zone-standard
//         https://learn.microsoft.com/azure/foundry/foundry-models/quotas-limits#subscription-level-quota-management
//         https://learn.microsoft.com/azure/developer/ai/keyless-connections#configure-roles-for-authorization
param name string
param location string
param tags object
param accountName string
param runIdentityName string
param modelName string = 'gpt-6.1-sol'
param modelVersion string = '2026-09-29'
@description('Type de déploiement : DataZoneStandard (quota libre) ou GlobalStandard (quota partagé de la souscription).')
@allowed(['DataZoneStandard', 'GlobalStandard'])
param modelSku string = 'DataZoneStandard'
@description('Capacité en milliers de jetons par minute.')
param modelCapacity int = 20

// Cognitive Services OpenAI User
var openAiUser = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')

// Identité lue par `existing` : un paramètre de module calculé à l'exécution court-circuite le what-if.
resource runIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' existing = {
  name: runIdentityName
}

resource account 'Microsoft.CognitiveServices/accounts@2026-09-01' = {
  name: accountName
  location: location
  tags: tags
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: accountName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource deployment 'Microsoft.CognitiveServices/accounts/deployments@2026-09-01' = {
  parent: account
  name: modelName
  sku: {
    name: modelSku
    capacity: modelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
  }
}

resource runOpenAi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: account
  name: guid(account.id, runIdentity.id, openAiUser)
  properties: {
    roleDefinitionId: openAiUser
    principalId: runIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'project=${name} : appel du modèle'
  }
}
