/**
 * Embedding providers.
 *  - "local" (default): BAAI bge-small-en-v1.5 via transformers.js. Free, no API key,
 *    384 dims, 512-token input window. Downloads ~35 MB of (8-bit quantized) model weights on first use.
 *  - "voyage": Voyage AI's voyage-3.5-lite (set VOYAGE_API_KEY). 512 dims.
 */
type Provider = "local" | "voyage";

const PROVIDER: Provider =
  (process.env.EMBEDDINGS_PROVIDER as Provider | undefined) ?? (process.env.VOYAGE_API_KEY ? "voyage" : "local");

export const EMBEDDING_DIM = PROVIDER === "voyage" ? 512 : 384;

const LOCAL_MODEL = "Xenova/bge-small-en-v1.5";
// bge models are trained to see this prefix on queries (not on passages).
const BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
const BATCH_SIZE = 32;

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    out.push(...(await embed(texts.slice(i, i + BATCH_SIZE), "document")));
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embed([text], "query");
  return vec;
}

async function embed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
  return PROVIDER === "voyage" ? embedVoyage(texts, kind) : embedLocal(texts, kind);
}

type Extractor = (
  texts: string[],
  opts: { pooling: "cls" | "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

const globalForModel = globalThis as unknown as { __ragExtractor?: Promise<Extractor> };

async function embedLocal(texts: string[], kind: "document" | "query"): Promise<number[][]> {
  globalForModel.__ragExtractor ??= import("@huggingface/transformers").then(({ env, pipeline }) => {
    // Serverless filesystems are read-only except /tmp.
    env.cacheDir = process.env.VERCEL ? "/tmp/models" : ".data/models";
    return pipeline("feature-extraction", LOCAL_MODEL, { dtype: "q8" }) as unknown as Promise<Extractor>;
  });
  const extractor = await globalForModel.__ragExtractor;
  const inputs = kind === "query" ? texts.map((t) => BGE_QUERY_PREFIX + t) : texts;
  // bge uses the [CLS] token embedding; normalized so cosine == dot product.
  const output = await extractor(inputs, { pooling: "cls", normalize: true });
  return output.tolist();
}

async function embedVoyage(texts: string[], kind: "document" | "query"): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "voyage-3.5-lite",
      input: texts,
      input_type: kind,
      output_dimension: EMBEDDING_DIM,
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage embeddings failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}
