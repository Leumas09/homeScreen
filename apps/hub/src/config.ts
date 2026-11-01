// Configuration lue dans l'environnement. Les secrets arrivent par les secrets de la Container App.
export const SITE = { lat: -33.9496, lon: 151.2577, name: "Maroubra" } as const;

function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export interface Config {
  port: number;
  staticDir: string;
  password: string | undefined;
  sessionSecret: string | undefined;
  /** Cookie « Secure » : vrai partout sauf en local. */
  secureCookies: boolean;
  version: string;
  /** Collecteurs réseau désactivés (tests). */
  offline: boolean;
  foundry: { endpoint?: string; deployment: string };
  tableEndpoint?: string;
  vapid: { publicKey?: string; privateKey?: string; subject: string };
  managedIdentityClientId?: string;
}

export function loadConfig(): Config {
  return {
    port: Number(env("PORT", "8080")),
    staticDir: env("STATIC_DIR", "../web/dist")!,
    password: env("APP_PASSWORD"),
    sessionSecret: env("SESSION_SECRET"),
    secureCookies: env("COOKIE_SECURE", "1") === "1",
    version: env("APP_VERSION", "dev")!,
    offline: env("OFFLINE", "0") === "1",
    foundry: { endpoint: env("FOUNDRY_ENDPOINT"), deployment: env("FOUNDRY_DEPLOYMENT", "gpt-6.1-sol")! },
    tableEndpoint: env("TABLE_ENDPOINT"),
    vapid: { publicKey: env("VAPID_PUBLIC_KEY"), privateKey: env("VAPID_PRIVATE_KEY"), subject: env("VAPID_SUBJECT", "mailto:admin@akakiwi.com")! },
    managedIdentityClientId: env("AZURE_CLIENT_ID"),
  };
}
