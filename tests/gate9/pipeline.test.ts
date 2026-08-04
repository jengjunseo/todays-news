import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StructuredGenerator } from "@/lib/ai/structured-generator";
import { FixtureNewsProvider } from "@/lib/news/providers/fixture";
import { NEWS_CATEGORIES, type NewsCategory, type NewsProvider } from "@/lib/news/types";
import { MemoryDigestPublisher } from "@/lib/pipeline/digest-publisher";
import { runDailyDigest } from "@/lib/pipeline/run-daily-digest";

const CATEGORY_LABEL: Record<NewsCategory, string> = {
  politics: "정치",
  society: "사회",
  science: "과학",
  technology: "IT·정보",
  economy: "경제",
};

function successfulGenerator(counts: Partial<Record<NewsCategory, number>> = {}) {
  const extraCandidates: Array<{
    category: NewsCategory;
    clusterId: string;
    score: number;
  }> = [];
  const generator: StructuredGenerator = {
    async generate(input) {
      const category = NEWS_CATEGORIES.find((item) =>
        input.prompt.includes(`분야: ${CATEGORY_LABEL[item]}`),
      )!;
      const candidateText = input.prompt.split("후보:\n")[1]!.split("\n\n출처:\n")[0]!;
      const candidates = JSON.parse(candidateText) as Array<{
        clusterId: string;
        title: string;
        score: number;
      }>;
      const sources = JSON.parse(input.prompt.split("출처:\n")[1]!) as Array<{
        id: string;
        clusterId: string;
      }>;
      const count = counts[category] ?? 1;
      if (count > 1 && candidates[1]) {
        extraCandidates.push({
          category,
          clusterId: candidates[1].clusterId,
          score: candidates[1].score,
        });
      }
      return {
        items: candidates.slice(0, count).map((candidate) => ({
          clusterId: candidate.clusterId,
          headline: candidate.title,
          oneLine: "실제 기사에서 확인된 핵심 내용입니다.",
          overview: "실제 기사에서 확인된 사건과 적용 조건을 함께 설명합니다.",
          keyPoints: ["확인된 결정입니다.", "후속 적용을 확인해야 합니다."],
          analogy: "확인된 구조를 쉬운 말로 다시 설명합니다.",
          whyItMatters: "실제 적용 범위에 따라 관련 주체의 선택이 달라질 수 있습니다.",
          socraticQuestion: "실제 변화로 이어졌는지 어떤 지표로 확인할 수 있을까요?",
          factStatus: "reported",
          confidence: 0.8,
          sourceIds: sources
            .filter((source) => source.clusterId === candidate.clusterId)
            .slice(0, 2)
            .map((source) => source.id),
        })),
      };
    },
  };
  return { generator, extraCandidates };
}

function multiClusterProvider(): NewsProvider {
  return {
    name: "multi-cluster-fixture",
    async search(input) {
      return [
        {
          title: `${CATEGORY_LABEL[input.category]} 예산 101 승인`,
          description: "예산 101 승인 내용이 확인됐습니다.",
          originalLink: `https://a.example/${input.category}`,
          providerLink: `https://a.example/${input.category}/provider`,
          publishedAt: new Date("2026-08-01T03:00:00.000Z"),
        },
        {
          title: `${CATEGORY_LABEL[input.category]} 의료 202 거부`,
          description: "의료 202 거부 내용이 확인됐습니다.",
          originalLink: `https://b.example/${input.category}`,
          providerLink: `https://b.example/${input.category}/provider`,
          publishedAt: new Date("2026-08-01T04:00:00.000Z"),
        },
      ];
    },
  };
}

describe("idempotent daily pipeline", () => {
  beforeEach(() => vi.stubEnv("DEMO_MODE", "true"));

  it("publishes once and skips the same source date on retry", async () => {
    const publisher = new MemoryDigestPublisher();
    const first = await runDailyDigest({ sourceDate: "2026-08-01", publisher, provider: new FixtureNewsProvider() });
    const second = await runDailyDigest({ sourceDate: "2026-08-01", publisher, provider: new FixtureNewsProvider() });
    expect(first.status).toBe("published");
    expect(second.status).toBe("skipped");
    expect(publisher.published.size).toBe(1);
    const published = publisher.published.get("2026-08-01")!;
    expect(published.nudges).toHaveLength(3);
    expect(new Set(published.clusters.map((cluster) => cluster.id))).toEqual(
      new Set(published.items.map((item) => item.clusterId)),
    );
    expect(new Set(published.articles.map((article) => article.id))).toEqual(
      new Set(published.clusters.flatMap((cluster) => cluster.articles.map((article) => article.id))),
    );
  });

  it("keeps one Primary for every category when AI returns one item each", async () => {
    const publisher = new MemoryDigestPublisher();
    const { generator } = successfulGenerator();

    await runDailyDigest({
      sourceDate: "2026-08-01",
      publisher,
      provider: multiClusterProvider(),
      summaryGenerator: generator,
    });

    const items = publisher.published.get("2026-08-01")!.items;
    expect(items).toHaveLength(5);
    expect(items.map((item) => item.category)).toEqual(NEWS_CATEGORIES);
  });

  it("adds at most two rank-2 Extras without removing Primaries", async () => {
    const publisher = new MemoryDigestPublisher();
    const { generator } = successfulGenerator({ science: 2, technology: 2 });

    await runDailyDigest({
      sourceDate: "2026-08-01",
      publisher,
      provider: multiClusterProvider(),
      summaryGenerator: generator,
    });

    const items = publisher.published.get("2026-08-01")!.items;
    expect(items).toHaveLength(7);
    expect(items.slice(0, 5).map((item) => item.category)).toEqual(NEWS_CATEGORIES);
    expect(items.slice(5).map((item) => item.category)).toEqual(["science", "technology"]);
  });

  it("selects the top two Extras deterministically", async () => {
    const publisher = new MemoryDigestPublisher();
    const { generator, extraCandidates } = successfulGenerator(
      Object.fromEntries(NEWS_CATEGORIES.map((category) => [category, 2])),
    );

    await runDailyDigest({
      sourceDate: "2026-08-01",
      publisher,
      provider: multiClusterProvider(),
      summaryGenerator: generator,
    });

    const categoryOrder = new Map(NEWS_CATEGORIES.map((category, index) => [category, index]));
    const expected = extraCandidates
      .sort(
        (left, right) =>
          right.score - left.score ||
          categoryOrder.get(left.category)! - categoryOrder.get(right.category)! ||
          left.clusterId.localeCompare(right.clusterId),
      )
      .slice(0, 2)
      .map((candidate) => candidate.clusterId);
    const actual = publisher.published.get("2026-08-01")!.items.slice(5).map((item) => item.clusterId);
    expect(actual).toEqual(expected);
  });

  it("omits only a category that has no candidates", async () => {
    const fixture = new FixtureNewsProvider();
    const provider: NewsProvider = {
      name: fixture.name,
      async search(input) {
        return input.category === "politics" ? [] : fixture.search(input);
      },
    };
    const publisher = new MemoryDigestPublisher();
    const { generator } = successfulGenerator();

    await runDailyDigest({
      sourceDate: "2026-08-01",
      publisher,
      provider,
      summaryGenerator: generator,
    });

    expect(publisher.published.get("2026-08-01")!.items.map((item) => item.category)).toEqual([
      "society",
      "science",
      "technology",
      "economy",
    ]);
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

  it("publishes deterministic Primary items when every category AI call fails", async () => {
    const publisher = new MemoryDigestPublisher();
    const failingGenerator: StructuredGenerator = {
      async generate() {
        throw new Error("AI Gateway requires a valid credit card on file");
      },
    };

    const result = await runDailyDigest({
      sourceDate: "2026-08-01",
      publisher,
      provider: new FixtureNewsProvider(),
      summaryGenerator: failingGenerator,
    });

    expect(result.status).toBe("published");
    const items = publisher.published.get("2026-08-01")!.items;
    expect(items).toHaveLength(5);
    expect(items.map((item) => item.category)).toEqual([
      "politics",
      "society",
      "science",
      "technology",
      "economy",
    ]);
    expect(items.every((item) => item.factStatus === "reported")).toBe(true);
  });

  it("uses deterministic fallback Primary items for valid empty AI results", async () => {
    const publisher = new MemoryDigestPublisher();
    const emptyGenerator: StructuredGenerator = { async generate() { return { items: [] }; } };

    await runDailyDigest({
      sourceDate: "2026-08-01",
      publisher,
      provider: new FixtureNewsProvider(),
      summaryGenerator: emptyGenerator,
    });

    expect(publisher.published.get("2026-08-01")!.items).toHaveLength(5);
  });
});
