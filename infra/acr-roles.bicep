// Rôles du projet sur l'ACR du socle. À supprimer avec le projet (voir README).
// Les identités sont lues par `existing` plutôt que reçues en sortie d'un autre module : un paramètre de module
// calculé à l'exécution court-circuite le what-if, qui n'affiche alors aucune ressource de ce module.
// Learn : https://learn.microsoft.com/azure/azure-resource-manager/bicep/linter-rule-what-if-short-circuiting
param registryName string
param identityResourceGroup string
param runIdentityName string
param ciIdentityName string
param projectName string

var acrPull = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
var acrPush = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8311e382-0749-4cb8-b61a-304f252e45ec')

resource registry 'Microsoft.ContainerRegistry/registries@2025-11-01' existing = {
  name: registryName
}

resource runIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' existing = {
  name: runIdentityName
  scope: resourceGroup(identityResourceGroup)
}

resource ciIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' existing = {
  name: ciIdentityName
  scope: resourceGroup(identityResourceGroup)
}

resource runPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, runIdentity.id, acrPull)
  properties: {
    roleDefinitionId: acrPull
    principalId: runIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'project=${projectName} : tirage de l\'image'
  }
}

resource ciPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, ciIdentity.id, acrPush)
  properties: {
    roleDefinitionId: acrPush
    principalId: ciIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'project=${projectName} : publication de l\'image'
  }
}
