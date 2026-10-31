// Modèle gpt-6.1-sol déployé dans Microsoft Foundry, appelé par l'API Responses avec l'identité
// managée de l'app (Microsoft Entra ID, jeton de portée https://ai.azure.com/.default) : aucune clé.
// Source : learn.microsoft.com/azure/foundry/foundry-models/how-to/configure-entra-id
import type { TokenCredential } from "@azure/identity";

export interface Llm {
  text(instructions: string, input: string, maxTokens?: number): Promise<string>;
  triageNews(items: { id: string; title: string; source: string }[]): Promise<{ id: string; local: boolean; topic: string; summary: string }[]>;
}

/** Texte de sortie d'une réponse de l'API Responses (champ de commodité ou parcours des sorties). */
export function outputText(j: { output_text?: string; output?: { type: string; content?: { type: string; text?: string }[] }[] }): string {
  if (typeof j.output_text === "string" && j.output_text) return j.output_text;
  return (j.output ?? [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text" && c.text)
    .map((c) => c.text)
    .join("");
}

export function foundryLlm(endpoint: string, deployment: string, credential: TokenCredential): Llm {
  const base = endpoint.replace(/\/+$/, "");
  async function call(body: Record<string, unknown>): Promise<string> {
    const token = await credential.getToken("https://ai.azure.com/.default");
    if (!token) throw new Error("no token for Foundry");
    const res = await fetch(`${base}/openai/v1/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.token}` },
      body: JSON.stringify({ model: deployment, reasoning: { effort: "low" }, ...body }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Foundry ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return outputText(await res.json());
  }
  return {
    text: (instructions, input, maxTokens = 400) => call({ instructions, input, max_output_tokens: maxTokens }),
    async triageNews(items) {
      const out = await call({
        instructions:
          "You sort news headlines for a family living in Maroubra, in the City of Randwick, Sydney. " +
          "For each item decide if it is local news about Randwick City (Maroubra, Randwick, Coogee, Kingsford, Kensington, Malabar, Matraville, Little Bay, La Perouse, Chifley, Clovelly) " +
          "or the beaches and coast nearby. Sport scores from elsewhere, real-estate ads and national stories that only mention a suburb in passing are not local. " +
          "Give a topic among: beach, environment, council, transport, community, safety, events, business, other. " +
          "Write a neutral one-sentence summary in plain English from the headline only; never invent facts. Answer with JSON only.",
        input: JSON.stringify(items),
        max_output_tokens: 3000,
        text: {
          format: {
            type: "json_schema", name: "triage", strict: true,
            schema: {
              type: "object", additionalProperties: false, required: ["items"],
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object", additionalProperties: false, required: ["id", "local", "topic", "summary"],
                    properties: { id: { type: "string" }, local: { type: "boolean" }, topic: { type: "string" }, summary: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      });
      return (JSON.parse(out) as { items: { id: string; local: boolean; topic: string; summary: string }[] }).items;
    },
  };
}
