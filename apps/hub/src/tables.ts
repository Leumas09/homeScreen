// Accès à Azure Table Storage par identité managée (aucune clé de compte).
// Sans point de terminaison configuré (en local), les fonctions qui en dépendent se replient en mémoire.
import { TableClient } from "@azure/data-tables";
import { DefaultAzureCredential, ManagedIdentityCredential, type TokenCredential } from "@azure/identity";

let credential: TokenCredential | null = null;

export function azureCredential(clientId?: string): TokenCredential {
  credential ??= clientId ? new ManagedIdentityCredential({ clientId }) : new DefaultAzureCredential();
  return credential;
}

const clients = new Map<string, TableClient>();

export function table(endpoint: string | undefined, name: string, clientId?: string): TableClient | null {
  if (!endpoint) return null;
  if (!clients.has(name)) clients.set(name, new TableClient(endpoint, name, azureCredential(clientId)));
  return clients.get(name)!;
}
