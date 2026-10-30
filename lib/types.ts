import type { RetrievedChunk } from "./retrieval";

export type { RetrievedChunk };

/** The chat route streams these as newline-delimited JSON. */
export type ChatEvent =
  | { type: "sources"; sources: RetrievedChunk[] }
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface LibraryDocument {
  id: string;
  name: string;
  subject: string | null;
  pages: number;
  chunks: number;
  createdAt: string;
}
