import { describe, expect, it } from "vitest";
import { chunkPages } from "./pdf";

describe("chunkPages", () => {
  it("uses 500-char chunks with 50-char overlap and keeps page numbers", () => {
    const text = "a".repeat(1000);
    const chunks = chunkPages([{ page: 3, text }], 500, 50);
    expect(chunks.map((c) => c.content.length)).toEqual([500, 500, 100]);
    expect(chunks.every((c) => c.page === 3)).toBe(true);
  });
});
