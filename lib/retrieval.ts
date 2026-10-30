import { getDb, toVectorLiteral } from "./db";
import { embedQuery } from "./embeddings";

export type SearchMode = "vector" | "hybrid";

export interface SearchOptions {
  k?: number;
  mode?: SearchMode;
  documentIds?: string[];
  subject?: string;
}

export interface RetrievedChunk {
  id: string;
  documentId: string;
  documentName: string;
  page: number;
  content: string;
  /** Cosine similarity between the question and this chunk, in [-1, 1]. */
  similarity: number;
}

interface Row {
  id: string;
  document_id: string;
  document_name: string;
  page: number;
  content: string;
  similarity: number;
}

// Reciprocal rank fusion constant; 60 is the value from the original RRF paper.
const RRF_K = 60;
const HYBRID_CANDIDATES = 20;

/** Minimum best-match similarity before we answer at all (below it: "not found in your notes"). */
export const MIN_SIMILARITY = Number(process.env.RETRIEVAL_MIN_SIMILARITY ?? 0.5);

/**
 * Full-text query that matches ANY of the question's words (ranked by how many match).
 * websearch_to_tsquery would require ALL words, which natural questions rarely satisfy.
 * Postgres drops English stop words ("what", "is", ...) itself.
 */
export function orTsQuery(question: string): string {
  const words = question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words)].join(" | ") || "''";
}

export async function search(query: string, opts: SearchOptions = {}): Promise<RetrievedChunk[]> {
  const k = opts.k ?? 5;
  const mode = opts.mode ?? "vector";
  const db = await getDb();
  const vec = toVectorLiteral(await embedQuery(query));
  const docIds = opts.documentIds?.length ? opts.documentIds : null;
  const subject = opts.subject || null;

  // $2/$3 are optional filters; NULL means "no filter".
  const filter = `($2::uuid[] IS NULL OR c.document_id = ANY($2::uuid[])) AND ($3::text IS NULL OR d.subject = $3)`;

  const rows =
    mode === "vector"
      ? await db.query<Row>(
          `SELECT c.id::text, c.document_id::text, d.name AS document_name, c.page, c.content,
                  1 - (c.embedding <=> $1::vector) AS similarity
           FROM chunks c JOIN documents d ON d.id = c.document_id
           WHERE ${filter}
           ORDER BY c.embedding <=> $1::vector
           LIMIT $4`,
          [vec, docIds, subject, k],
        )
      : await db.query<Row>(
          `WITH v AS (
             SELECT c.id, row_number() OVER (ORDER BY c.embedding <=> $1::vector) AS r
             FROM chunks c JOIN documents d ON d.id = c.document_id
             WHERE ${filter}
             ORDER BY c.embedding <=> $1::vector
             LIMIT $5
           ),
           t AS (
             SELECT c.id, row_number() OVER (ORDER BY ts_rank_cd(c.tsv, q) DESC) AS r
             FROM chunks c JOIN documents d ON d.id = c.document_id,
                  to_tsquery('english', $6) q
             WHERE ${filter} AND c.tsv @@ q
             ORDER BY ts_rank_cd(c.tsv, q) DESC
             LIMIT $5
           )
           SELECT c.id::text, c.document_id::text, d.name AS document_name, c.page, c.content,
                  1 - (c.embedding <=> $1::vector) AS similarity
           FROM (SELECT id FROM v UNION SELECT id FROM t) ids
           JOIN chunks c ON c.id = ids.id
           JOIN documents d ON d.id = c.document_id
           LEFT JOIN v ON v.id = c.id
           LEFT JOIN t ON t.id = c.id
           ORDER BY COALESCE(1.0 / (${RRF_K} + v.r), 0) + COALESCE(1.0 / (${RRF_K} + t.r), 0) DESC
           LIMIT $4`,
          [vec, docIds, subject, k, HYBRID_CANDIDATES, orTsQuery(query)],
        );

  return rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    documentName: r.document_name,
    page: Number(r.page),
    content: r.content,
    similarity: Number(r.similarity),
  }));
}
