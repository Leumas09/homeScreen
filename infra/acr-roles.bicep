// Rôles du projet sur l'ACR du socle. À supprimer avec le projet (voir README).
param registryName string
param runPrincipalId string
param ciPrincipalId string
// ID de ressource des identités : connus avant le déploiement, ils rendent le nom des attributions calculable par le what-if.
param runIdentityId string
param ciIdentityId string
param projectName string

var acrPull = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
var acrPush = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8311e382-0749-4cb8-b61a-304f252e45ec')

resource registry 'Microsoft.ContainerRegistry/registries@2025-11-01' existing = {
  name: registryName
}

resource runPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, runIdentityId, acrPull)
  properties: {
    roleDefinitionId: acrPull
    principalId: runPrincipalId
    principalType: 'ServicePrincipal'
    description: 'project=${projectName} : tirage de l\'image'
  }
}

resource ciPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, ciIdentityId, acrPush)
  properties: {
    roleDefinitionId: acrPush
    principalId: ciPrincipalId
    principalType: 'ServicePrincipal'
    description: 'project=${projectName} : publication de l\'image'
  }
}
