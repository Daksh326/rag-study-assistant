import { describe, expect, it } from "vitest";
import { parseCitations } from "@/lib/citations";
import { orTsQuery } from "@/lib/retrieval";

describe("parseCitations", () => {
  it("splits text and in-range citation markers", () => {
    expect(parseCitations("A stack is LIFO [1][2].", 2)).toEqual([
      { type: "text", text: "A stack is LIFO " },
      { type: "cite", source: 1 },
      { type: "cite", source: 2 },
      { type: "text", text: "." },
    ]);
  });

  it("leaves out-of-range markers as plain text", () => {
    expect(parseCitations("See [7] and [0].", 3)).toEqual([{ type: "text", text: "See [7] and [0]." }]);
  });

  it("handles an empty answer", () => {
    expect(parseCitations("", 5)).toEqual([]);
  });
});

describe("orTsQuery", () => {
  it("ORs unique words and strips tsquery syntax characters", () => {
    expect(orTsQuery("What's a B-tree? A b-tree & (heap)!")).toBe("what | s | a | b | tree | heap");
  });

  it("never returns an empty query", () => {
    expect(orTsQuery("?!")).toBe("''");
  });
});
