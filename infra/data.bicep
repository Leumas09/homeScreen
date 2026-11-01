// Stockage du projet : tables pour l'archive des prévisions et observations, les abonnements
// aux notifications et les votes. Accès par identité managée uniquement : clé partagée désactivée.
// Learn : https://learn.microsoft.com/azure/storage/common/shared-key-authorization-prevent
param name string
param location string
param tags object
param storageName string
param runIdentityName string

// Storage Table Data Contributor (Learn : https://learn.microsoft.com/azure/role-based-access-control/built-in-roles/storage#storage-table-data-contributor)
var tableDataContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3')

// Identité lue par `existing` : un paramètre de module calculé à l'exécution court-circuite le what-if.
resource runIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' existing = {
  name: runIdentityName
}

resource storage 'Microsoft.Storage/storageAccounts@2026-06-01' = {
  name: storageName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    allowSharedKeyAccess: false
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
  }

  resource tableService 'tableServices' = {
    name: 'default'

    resource archive 'tables' = {
      name: 'archive'
    }

    resource push 'tables' = {
      name: 'push'
    }

    resource votes 'tables' = {
      name: 'votes'
    }
  }
}

resource runTables 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, runIdentity.id, tableDataContributor)
  properties: {
    roleDefinitionId: tableDataContributor
    principalId: runIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'project=${name} : lecture et écriture des tables'
  }
}
