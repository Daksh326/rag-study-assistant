export interface PageText {
  page: number; // 1-based
  text: string;
}

export interface Chunk {
  page: number;
  index: number; // position within the document
  content: string;
  tokens: number;
}

export interface ChunkOptions {
  chunkTokens?: number;
  overlapTokens?: number;
}

// ~4 characters per token is a good-enough estimate for English prose and avoids
// shipping a tokenizer. Chunk sizes only need to be roughly right.
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Undo common PDF extraction artifacts: hyphenated line breaks, NULs, ragged whitespace. */
export function cleanText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/(\w)-\s*\n\s*(\w)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

const EDGE_LINES = 5;

/**
 * Drop running headers and footers: lines that repeat on at least half the pages.
 * Within the top and bottom few lines of a page, digits are ignored when comparing, so
 * "Page 3 of 9" matches "Page 4 of 9"; elsewhere only exact repeats count, so body lines
 * that differ just by a number ("Step 1", "Step 2") survive.
 * Only applies to documents of 3+ pages, where repetition is meaningful.
 */
export function stripRepeatedLines(pages: PageText[]): PageText[] {
  if (pages.length < 3) return pages;
  const exactKey = (line: string) => line.trim().toLowerCase();
  const fuzzyKey = (line: string) => exactKey(line).replace(/\d+/g, "#");
  const isEdge = (i: number, total: number) => i < EDGE_LINES || i >= total - EDGE_LINES;

  const split = pages.map(({ page, text }) => ({ page, lines: text.split("\n") }));
  const exactCounts = new Map<string, number>();
  const fuzzyCounts = new Map<string, number>();
  for (const { lines } of split) {
    const exact = new Set(lines.map(exactKey));
    const fuzzy = new Set(lines.filter((_, i) => isEdge(i, lines.length)).map(fuzzyKey));
    for (const k of exact) if (k) exactCounts.set(k, (exactCounts.get(k) ?? 0) + 1);
    for (const k of fuzzy) if (k) fuzzyCounts.set(k, (fuzzyCounts.get(k) ?? 0) + 1);
  }

  const threshold = Math.max(3, Math.ceil(pages.length / 2));
  return split.map(({ page, lines }) => ({
    page,
    text: lines
      .filter(
        (line, i) =>
          (exactCounts.get(exactKey(line)) ?? 0) < threshold &&
          !(isEdge(i, lines.length) && (fuzzyCounts.get(fuzzyKey(line)) ?? 0) >= threshold),
      )
      .join("\n"),
  }));
}

/**
 * Split each page into chunks of about `chunkTokens`, with `overlapTokens` of trailing
 * context repeated at the start of the next chunk. Chunks never cross a page boundary,
 * so every chunk carries exactly one page number for citations.
 */
export function chunkPages(pages: PageText[], opts: ChunkOptions = {}): Chunk[] {
  const chunkTokens = opts.chunkTokens ?? 400;
  const overlapTokens = opts.overlapTokens ?? 60;
  if (overlapTokens >= chunkTokens) throw new Error("overlapTokens must be smaller than chunkTokens");

  const maxChars = chunkTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;
  const chunks: Chunk[] = [];

  for (const { page, text } of stripRepeatedLines(pages)) {
    const units = splitUnits(cleanText(text), maxChars);
    let start = 0;
    while (start < units.length) {
      // Greedily pack sentence units up to the size budget (always take at least one).
      let end = start;
      let len = 0;
      while (end < units.length && (end === start || len + units[end].length + 1 <= maxChars)) {
        len += units[end].length + 1;
        end++;
      }
      const content = units.slice(start, end).join(" ");
      chunks.push({ page, index: chunks.length, content, tokens: estimateTokens(content) });
      if (end >= units.length) break;

      // Step back over trailing units for overlap, but always make forward progress.
      let next = end;
      let overlap = 0;
      while (next - 1 > start && overlap + units[next - 1].length <= overlapChars) {
        overlap += units[next - 1].length + 1;
        next--;
      }
      start = next;
    }
  }
  return chunks;
}

/** Sentences, with any sentence longer than maxChars split on word boundaries. */
function splitUnits(text: string, maxChars: number): string[] {
  if (!text) return [];
  const units: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (sentence.length <= maxChars) {
      units.push(sentence);
      continue;
    }
    let current = "";
    for (const word of sentence.split(" ")) {
      if (current && current.length + word.length + 1 > maxChars) {
        units.push(current);
        current = "";
      }
      current = current ? `${current} ${word}` : word;
    }
    if (current) units.push(current);
  }
  return units;
}
