// Identités du projet, créées avant tout le reste pour que leurs rôles existent quand l'app démarre.
// Repris de examples/app-minimal du socle, avec l'ID client de l'identité d'exécution en sortie
// (l'app s'en sert pour Table Storage et Foundry).
param name string
param location string
param tags object
param githubSubject string

// Identité d'exécution : tire l'image (AcrPull), lit et écrit les tables, appelle le modèle Foundry.
resource runIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: 'id-${name}-run'
  location: location
  tags: tags
}

// Identité de déploiement : utilisée par le workflow GitHub en OIDC, sans secret.
resource ciIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: 'id-${name}-ci'
  location: location
  tags: tags

  // Seule la branche main du dépôt du projet peut obtenir un jeton.
  resource github 'federatedIdentityCredentials' = {
    name: 'github-main'
    properties: {
      issuer: 'https://token.actions.githubusercontent.com'
      subject: githubSubject
      audiences: ['api://AzureADTokenExchange']
    }
  }
}

output runIdentityId string = runIdentity.id
output runPrincipalId string = runIdentity.properties.principalId
output runClientId string = runIdentity.properties.clientId
output ciIdentityId string = ciIdentity.id
output ciPrincipalId string = ciIdentity.properties.principalId
output ciClientId string = ciIdentity.properties.clientId
