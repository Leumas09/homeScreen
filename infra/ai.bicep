// Microsoft Foundry : compte AIServices et déploiement du modèle gpt-6.1-sol (Global Standard,
// disponible en Australia East, sans demande d'accès). Appelé par l'identité managée de l'app,
// sans clé : authentification locale désactivée.
// Learn : https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure#gpt-61
//         https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability
//         https://learn.microsoft.com/azure/developer/ai/keyless-connections#configure-roles-for-authorization
param name string
param location string
param tags object
param runPrincipalId string
param runIdentityId string
param modelName string = 'gpt-6.1-sol'
param modelVersion string = '2026-09-29'
@description('Capacité en milliers de jetons par minute.')
param modelCapacity int = 20

// Cognitive Services OpenAI User
var openAiUser = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
var accountName = 'ai-${name}-${uniqueString(resourceGroup().id)}'

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
    name: 'GlobalStandard'
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
  name: guid(account.id, runIdentityId, openAiUser)
  properties: {
    roleDefinitionId: openAiUser
    principalId: runPrincipalId
    principalType: 'ServicePrincipal'
    description: 'project=${name} : appel du modèle'
  }
}

output endpoint string = 'https://${accountName}.openai.azure.com'
output deploymentName string = deployment.name
