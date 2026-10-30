import { search, type SearchMode } from "@/lib/retrieval";

/** Retrieval only, no LLM call. Used by the evaluation script and for debugging. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    query?: string;
    k?: number;
    mode?: SearchMode;
    documentIds?: string[];
    subject?: string;
  } | null;

  const query = body?.query?.trim();
  if (!query) {
    return Response.json({ error: "Missing 'query'." }, { status: 400 });
  }
  const mode = body?.mode === "hybrid" ? "hybrid" : "vector";
  const k = Math.min(Math.max(Number(body?.k ?? 5), 1), 50);

  const results = await search(query, { k, mode, documentIds: body?.documentIds, subject: body?.subject });
  return Response.json({ mode, k, results });
}
