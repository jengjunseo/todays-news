import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StructuredGenerator } from "@/lib/ai/structured-generator";
import { FixtureNewsProvider } from "@/lib/news/providers/fixture";
import type { NewsProvider } from "@/lib/news/types";
import { MemoryDigestPublisher } from "@/lib/pipeline/digest-publisher";
import { runDailyDigest } from "@/lib/pipeline/run-daily-digest";

describe("idempotent daily pipeline", () => {
  beforeEach(() => vi.stubEnv("DEMO_MODE", "true"));

  it("publishes once and skips the same source date on retry", async () => {
    const publisher = new MemoryDigestPublisher();
    const first = await runDailyDigest({ sourceDate: "2026-08-01", publisher, provider: new FixtureNewsProvider() });
    const second = await runDailyDigest({ sourceDate: "2026-08-01", publisher, provider: new FixtureNewsProvider() });
    expect(first.status).toBe("published");
    expect(second.status).toBe("skipped");
    expect(publisher.published.size).toBe(1);
    expect(publisher.published.get("2026-08-01")?.nudges).toHaveLength(3);
  });

  it("keeps the last published digest when forced generation fails", async () => {
    const publisher = new MemoryDigestPublisher();
    await runDailyDigest({ sourceDate: "2026-08-01", publisher, provider: new FixtureNewsProvider() });
    const previous = structuredClone(publisher.published.get("2026-08-01"));
    const failing: NewsProvider = {
      name: "failing",
      async search() {
        throw new Error("provider unavailable");
      },
    };
    await expect(runDailyDigest({ sourceDate: "2026-08-01", force: true, publisher, provider: failing })).rejects.toThrow("provider unavailable");
    expect(publisher.published.get("2026-08-01")).toEqual(previous);
  });

  it("records a representative AI error when every category fails", async () => {
    const publisher = new MemoryDigestPublisher();
    const failingGenerator: StructuredGenerator = {
      async generate() {
        throw new Error("AI Gateway requires a valid credit card on file");
      },
    };

    await expect(
      runDailyDigest({
        sourceDate: "2026-08-01",
        publisher,
        provider: new FixtureNewsProvider(),
        summaryGenerator: failingGenerator,
      }),
    ).rejects.toThrow("AI Gateway requires a valid credit card on file");

    expect([...publisher.runs.values()][0]).toMatchObject({
      status: "failed",
      error: expect.stringContaining("AI Gateway requires a valid credit card on file"),
    });
  });
});
