import type { RetrievedChunk } from "./retrieval";

// Kept byte-for-byte stable across requests so it can be prompt-cached later.
export const SYSTEM_PROMPT = `You are a study assistant for a university student. You answer questions using only the excerpts from the student's own notes and papers that are provided with each question.

How to answer:
- Use only the numbered sources. Do not add facts from general knowledge, even if you know them.
- Cite every claim with the number of the source it came from, in square brackets, e.g. "A stack is LIFO [2]." Use several citations like [1][3] when a claim draws on more than one source.
- If the sources don't contain the answer, say plainly that you couldn't find it in their notes, and mention what the sources do cover if that's useful.
- Write for a student revising for an exam: clear, direct, and well organized. Use short paragraphs or simple "-" bullet lists. Don't use markdown headings, bold, or tables.`;

export function buildUserMessage(question: string, sources: RetrievedChunk[]): string {
  const context = sources
    .map((s, i) => `<source id="${i + 1}" document="${escapeAttr(s.documentName)}" page="${s.page}">\n${s.content}\n</source>`)
    .join("\n\n");
  return `<sources>\n${context}\n</sources>\n\nQuestion: ${question}`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
