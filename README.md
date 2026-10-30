# RAG Study Assistant

Upload your PDFs (lecture notes, question papers, papers) and ask questions about them. Answers come only from your documents and every claim cites the page it came from.

![CI](https://github.com/OWNER/rag-study-assistant/actions/workflows/ci.yml/badge.svg)

> **Demo:** _GIF coming soon_ · **Live:** _link coming soon_

## The problem

Searching through a semester of PDFs before an exam is slow, and generic chatbots answer from general knowledge rather than from what your course actually taught. This app retrieves the relevant pages from your own notes, has an LLM answer from those pages only, and shows citations you can click to check the source text. When the notes don't cover a question, it says so instead of guessing.

## How it works

```
upload ─▶ extract text per page ─▶ strip headers/footers ─▶ chunk (~400 tokens, 60 overlap)
       ─▶ embed ─▶ Postgres + pgvector (HNSW index) + full-text index

question ─▶ embed ─▶ top-5 chunks (vector, or hybrid vector + keyword with RRF)
         ─▶ best match below threshold? ─▶ "not found in your notes"
         ─▶ otherwise: chunks + question ─▶ Claude ─▶ streamed answer with [n] citations
```

- **Page-level citations:** chunks never cross a page boundary, so every chunk carries one page number.
- **Hybrid search:** pgvector cosine similarity fused with Postgres full-text search using reciprocal rank fusion.
- **Grounding:** the system prompt restricts the model to the numbered sources, and a similarity threshold short-circuits off-topic questions before any LLM call.

## Tech stack

| Layer | Tool |
|---|---|
| Frontend | Next.js 16 (App Router), Tailwind CSS 4 |
| Database | Postgres + pgvector: Neon in production, embedded [PGlite](https://pglite.dev) locally (no Docker needed) |
| PDF parsing | [unpdf](https://github.com/unjs/unpdf) (pdf.js) |
| Embeddings | `bge-small-en-v1.5` running locally via transformers.js (free), or Voyage AI |
| LLM | Claude (`claude-opus-5-5` by default) via the Anthropic SDK, streamed |
| Evaluation | Python script (stdlib only): hit rate@k and MRR |
| Tests / CI | Vitest, ESLint, GitHub Actions |

## Run locally

Requires Node 22+ (and Python 3.10+ for the evaluation script).

```bash
npm install
cp .env.example .env.local   # then add ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000, upload PDFs on the **Library** page, then ask questions on **Ask**.

- With no `DATABASE_URL`, data is stored in `.data/pglite` (delete the folder to reset).
- The first upload downloads the embedding model (~35 MB) into `.data/models`.
- Without an API key the app still works for retrieval: it shows the most relevant passages instead of a generated answer.

```bash
npm test          # unit tests
npm run lint
npm run typecheck
```

## API

| Route | Purpose |
|---|---|
| `POST /api/ingest` | multipart `file` (PDF) + optional `subject` |
| `GET /api/documents` · `DELETE /api/documents/:id` | library |
| `POST /api/search` | `{query, k, mode: "vector" \| "hybrid"}`, retrieval only (used by the eval) |
| `POST /api/chat` | `{question, history?, mode?, subject?, documentIds?}`, streams NDJSON events |

## Evaluation

`eval/questions.jsonl` holds hand-written questions with the document and page that answer them. With the dev server running:

```bash
python eval/run_eval.py eval/questions.jsonl --modes vector hybrid --label "chunk 400" --show-misses
```

To compare chunk sizes, set `CHUNK_TOKENS` (e.g. 300 / 400 / 800), reset `.data/pglite`, re-upload, and rerun.

| Configuration | Hit rate@5 | MRR |
|---|---|---|
| _to be filled in from your 30–50 question set_ | | |

## What I learned

_To be written._

## License

MIT
