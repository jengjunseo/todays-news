import { describe, expect, it } from "vitest";

import { getDemoDigest } from "@/lib/demo/digest";

describe("mobile demo digest", () => {
  it("builds a complete ten-item digest and three nudges without external calls", async () => {
    const digest = await getDemoDigest();
    expect(digest.items.length).toBeGreaterThanOrEqual(5);
    expect(digest.items.length).toBeLessThanOrEqual(10);
    expect(digest.nudges).toHaveLength(3);
    expect(new Set(digest.items.map((item) => item.category)).size).toBe(5);
    expect(digest.items.every((item) => item.sources.length >= 2)).toBe(true);
  });
});
