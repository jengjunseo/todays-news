import { afterEach, describe, expect, it, vi } from "vitest";

import { collectNewsCandidates } from "@/lib/news/collect";
import { FixtureNewsProvider } from "@/lib/news/providers/fixture";
import { NaverNewsProvider } from "@/lib/news/providers/naver";
import { isOnKstDate, previousKstDate } from "@/lib/time/kst";

afterEach(() => vi.restoreAllMocks());

describe("news providers", () => {
  it("calculates the previous day explicitly in Asia/Seoul", () => {
    expect(previousKstDate(new Date("2026-08-02T22:00:00Z"))).toBe("2026-08-02");
    expect(isOnKstDate(new Date("2026-08-01T15:00:00Z"), "2026-08-02")).toBe(true);
  });

  it("fixture covers all five categories and removes repeated URLs across queries", async () => {
    const articles = await collectNewsCandidates("2026-08-01", new FixtureNewsProvider());
    expect(new Set(articles.map((article) => article.category)).size).toBe(5);
    expect(new Set(articles.map((article) => article.canonicalUrl)).size).toBe(articles.length);
    for (const category of ["politics", "society", "science", "technology", "economy"]) {
      expect(articles.filter((article) => article.category === category).length).toBeGreaterThanOrEqual(6);
    }
  });

  it("validates NAVER responses and keeps only the target KST date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          total: 2,
          start: 1,
          display: 2,
          items: [
            {
              title: "대상 날짜",
              originallink: "https://example.com/target",
              link: "https://n.news.naver.com/target",
              description: "설명",
              pubDate: "Sat, 01 Aug 2026 23:30:00 +0900",
            },
            {
              title: "이전 날짜",
              originallink: "https://example.com/old",
              link: "https://n.news.naver.com/old",
              description: "설명",
              pubDate: "Fri, 31 Jul 2026 23:30:00 +0900",
            },
          ],
        }),
      ),
    );
    const result = await new NaverNewsProvider("id", "secret").search({
      query: "정책",
      category: "politics",
      sourceDate: "2026-08-01",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("대상 날짜");
  });

  it("rejects a malformed provider response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: "invalid" })));
    await expect(
      new NaverNewsProvider("id", "secret").search({
        query: "정책",
        category: "politics",
        sourceDate: "2026-08-01",
      }),
    ).rejects.toThrow();
  });
});
