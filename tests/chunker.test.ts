import { describe, expect, it } from "vitest";
import { chunkPages, cleanText, estimateTokens, stripRepeatedLines } from "@/lib/chunker";

const sentence = (i: number) => `Sentence number ${i} talks about linked lists and stacks.`;
const longPage = Array.from({ length: 200 }, (_, i) => sentence(i)).join(" ");

describe("cleanText", () => {
  it("joins hyphenated line breaks and collapses whitespace", () => {
    expect(cleanText("data struc-\n  ture   is\n\nuseful")).toBe("data structure is useful");
  });

  it("removes NUL characters, which Postgres rejects", () => {
    expect(cleanText("a\u0000b")).toBe("ab");
  });
});

describe("chunkPages", () => {
  it("keeps chunks within the token budget and tags each with its page", () => {
    const chunks = chunkPages([{ page: 3, text: longPage }], { chunkTokens: 100, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) {
      expect(c.page).toBe(3);
      expect(c.tokens).toBeLessThanOrEqual(100);
    }
  });

  it("numbers chunks sequentially across pages", () => {
    const chunks = chunkPages(
      [
        { page: 1, text: "Page one text." },
        { page: 2, text: "Page two text." },
      ],
      { chunkTokens: 100, overlapTokens: 10 },
    );
    expect(chunks.map((c) => [c.page, c.index])).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });

  it("repeats trailing context at the start of the next chunk", () => {
    const chunks = chunkPages([{ page: 1, text: longPage }], { chunkTokens: 100, overlapTokens: 30 });
    const sentencesOf = (s: string) => s.split(/(?<=\.)\s+/);
    const first = sentencesOf(chunks[0].content);
    const second = sentencesOf(chunks[1].content);
    // The second chunk opens with the tail of the first one...
    const overlap = second.filter((s) => first.includes(s));
    expect(overlap.length).toBeGreaterThan(0);
    expect(second.slice(0, overlap.length)).toEqual(first.slice(-overlap.length));
    // ...and that tail fits the overlap budget (30 tokens ~ 120 chars).
    expect(overlap.join(" ").length).toBeLessThanOrEqual(120);
  });

  it("covers every sentence of the page", () => {
    const chunks = chunkPages([{ page: 1, text: longPage }], { chunkTokens: 100, overlapTokens: 30 });
    const joined = chunks.map((c) => c.content).join(" ");
    for (let i = 0; i < 200; i++) expect(joined).toContain(sentence(i));
  });

  it("splits a single over-long sentence on word boundaries", () => {
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkPages([{ page: 1, text: words }], { chunkTokens: 50, overlapTokens: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(estimateTokens(c.content)).toBeLessThanOrEqual(50);
  });

  it("skips empty pages", () => {
    expect(chunkPages([{ page: 1, text: "   \n " }])).toEqual([]);
  });

  it("rejects overlap >= chunk size", () => {
    expect(() => chunkPages([], { chunkTokens: 50, overlapTokens: 50 })).toThrow();
  });
});

describe("stripRepeatedLines", () => {
  it("drops running headers even when the page number changes", () => {
    const pages = [1, 2, 3, 4].map((n) => ({
      page: n,
      text: [
        "QP25DP2_145 | 01-Mar-2025",
        `Printed Page: ${n} of 4`,
        "Subject Code: BCS301",
        "Intro paragraph.",
        "Body line A.",
        `Step ${n}: body text that differs only by a number.`,
        "Body line B.",
        "Body line C.",
        "Body line D.",
        "Closing line.",
        `${n} | P a g e`,
      ].join("\n"),
    }));
    for (const p of stripRepeatedLines(pages)) {
      expect(p.text).not.toContain("QP25DP2");
      expect(p.text).not.toContain("Printed Page");
      expect(p.text).not.toContain("Subject Code");
      expect(p.text).not.toContain("P a g e");
      expect(p.text).toContain(`Step ${p.page}: body text`);
    }
  });

  it("leaves short documents alone", () => {
    const pages = [
      { page: 1, text: "Header\nA" },
      { page: 2, text: "Header\nB" },
    ];
    expect(stripRepeatedLines(pages)).toEqual(pages);
  });
});
