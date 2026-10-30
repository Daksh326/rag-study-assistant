/**
 * Schema is created on first connection (idempotent). The vector column's size
 * must match the embedding model, so switching providers means a fresh database.
 */
export function schemaSql(dim: number): string[] {
  return [
    `CREATE EXTENSION IF NOT EXISTS vector`,
    `CREATE TABLE IF NOT EXISTS documents (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name        text NOT NULL,
      subject     text,
      pages       integer NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS chunks (
      id           bigserial PRIMARY KEY,
      document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      page         integer NOT NULL,
      chunk_index  integer NOT NULL,
      content      text NOT NULL,
      token_count  integer NOT NULL,
      embedding    vector(${dim}) NOT NULL,
      tsv          tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
    )`,
    `CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops)`,
    `CREATE INDEX IF NOT EXISTS chunks_tsv_gin ON chunks USING gin (tsv)`,
    `CREATE INDEX IF NOT EXISTS chunks_document_id ON chunks (document_id)`,
  ];
}
