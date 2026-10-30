import { chunkPages } from "./chunker";
import { getDb, toVectorLiteral } from "./db";
import { embedDocuments } from "./embeddings";
import { extractPages } from "./pdf";

export class IngestError extends Error {}

export interface IngestedDocument {
  id: string;
  name: string;
  subject: string | null;
  pages: number;
  chunks: number;
}

const INSERT_BATCH = 64;

export async function ingestPdf(input: {
  name: string;
  subject: string | null;
  bytes: Uint8Array;
}): Promise<IngestedDocument> {
  let pages;
  try {
    pages = await extractPages(input.bytes);
  } catch {
    throw new IngestError("Could not read this file as a PDF.");
  }

  const chunks = chunkPages(pages, {
    chunkTokens: Number(process.env.CHUNK_TOKENS ?? 400),
    overlapTokens: Number(process.env.CHUNK_OVERLAP_TOKENS ?? 60),
  });
  if (chunks.length === 0) {
    throw new IngestError(
      "No text found in this PDF. It is probably a scanned document (images only); OCR isn't supported yet.",
    );
  }

  // Embed before touching the database so a failed embedding call leaves nothing behind.
  const embeddings = await embedDocuments(chunks.map((c) => c.content));

  const db = await getDb();
  const [doc] = await db.query<{ id: string }>(
    `INSERT INTO documents (name, subject, pages) VALUES ($1, $2, $3) RETURNING id`,
    [input.name, input.subject, pages.length],
  );

  try {
    for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
      const batch = chunks.slice(i, i + INSERT_BATCH);
      await db.query(
        `INSERT INTO chunks (document_id, page, chunk_index, content, token_count, embedding)
         SELECT $1, u.page, u.idx, u.content, u.tokens, u.emb::vector
         FROM unnest($2::int[], $3::int[], $4::text[], $5::int[], $6::text[]) AS u(page, idx, content, tokens, emb)`,
        [
          doc.id,
          batch.map((c) => c.page),
          batch.map((c) => c.index),
          batch.map((c) => c.content),
          batch.map((c) => c.tokens),
          batch.map((_, j) => toVectorLiteral(embeddings[i + j])),
        ],
      );
    }
  } catch (err) {
    await db.query(`DELETE FROM documents WHERE id = $1`, [doc.id]);
    throw err;
  }

  return { id: doc.id, name: input.name, subject: input.subject, pages: pages.length, chunks: chunks.length };
}
