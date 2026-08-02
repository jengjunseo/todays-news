import { describe, expect, it, vi } from "vitest";

import type { StructuredGenerator } from "@/lib/ai/structured-generator";
import { summarizeStory } from "@/lib/digest/summarize-story";
import type { StoryCluster } from "@/lib/news/cluster";

function cluster(id: string, category: StoryCluster["category"] = "economy"): StoryCluster {
  return {
    id,
    category,
    targetDate: "2026-08-01",
    representativeTitle: "한국은행 기준금리 동결",
    deterministicScore: 90,
    articleCount: 2,
    sourceCount: 2,
    queryCount: 2,
    articles: ["a", "b"].map((suffix, index) => ({
      id: `${id}${suffix}`.padEnd(32, "0").slice(0, 32),
      provider: "fixture",
      category,
      query: `금리 ${index}`,
      title: "한국은행 기준금리 동결",
      normalizedTitle: "한국은행 기준금리 동결",
      description: "물가와 가계부채를 함께 고려한 결정입니다.",
      canonicalUrl: `https://${suffix}.example/${id}`,
      providerUrl: `https://n.news.naver.com/${id}/${suffix}`,
      sourceDomain: `${suffix}.example`,
      publishedAt: "2026-08-01T03:00:00.000Z",
      targetDate: "2026-08-01",
    })),
  };
}

function validItem(clusterId: string, sourceIds = ["S1", "S2"]) {
  return {
    clusterId,
    headline: "한국은행, 기준금리 동결",
    oneLine: "물가와 가계부채를 함께 고려해 금리를 유지했습니다.",
    overview: "한국은행이 기준금리를 유지했습니다.",
    keyPoints: ["금리를 바꾸지 않았습니다.", "물가와 부채 위험을 함께 봤습니다."],
    analogy: "속도와 안전을 함께 보는 운전과 비슷합니다.",
    whyItMatters: "대출 이자와 소비 여건에 영향을 줍니다.",
    socraticQuestion: "물가와 부채 중 어느 위험을 먼저 줄여야 할까요?",
    factStatus: "confirmed" as const,
    confidence: 0.9,
    sourceIds,
  };
}

function mockGenerator(outputs: unknown[]): StructuredGenerator & { generate: ReturnType<typeof vi.fn> } {
  return { generate: vi.fn(async () => outputs.shift()) };
}

describe("AI selection and grounded explanation", () => {
  it("accepts a valid schema and assigns category rank", async () => {
    const generator = mockGenerator([{ items: [validItem("cluster-1")] }]);
    const result = await summarizeStory("economy", [cluster("cluster-1")], generator);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ category: "economy", rank: 1 });
  });

  it("rejects an unknown source ID then succeeds on one correction retry", async () => {
    const generator = mockGenerator([
      { items: [validItem("cluster-1", ["S99"])] },
      { items: [validItem("cluster-1")] },
    ]);
    const result = await summarizeStory("economy", [cluster("cluster-1")], generator);
    expect(result).toHaveLength(1);
    expect(generator.generate).toHaveBeenCalledTimes(2);
  });

  it("rejects a cluster outside candidates", async () => {
    const generator = mockGenerator([
      { items: [validItem("invented")] },
      { items: [validItem("invented")] },
    ]);
    expect(await summarizeStory("economy", [cluster("cluster-1")], generator)).toEqual([]);
  });

  it("rejects duplicate clusters and more than two items", async () => {
    const duplicate = { items: [validItem("cluster-1"), validItem("cluster-1")] };
    const tooMany = {
      items: [validItem("cluster-1"), validItem("cluster-2"), validItem("cluster-3")],
    };
    expect(
      await summarizeStory(
        "economy",
        [cluster("cluster-1"), cluster("cluster-2"), cluster("cluster-3")],
        mockGenerator([duplicate, tooMany]),
      ),
    ).toEqual([]);
  });

  it("falls back to excluding the category after two invalid responses", async () => {
    const generator = mockGenerator([{ invalid: true }, { invalid: true }]);
    expect(await summarizeStory("economy", [cluster("cluster-1")], generator)).toEqual([]);
    expect(generator.generate).toHaveBeenCalledTimes(2);
  });
});
