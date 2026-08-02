import { NEWS_CONFIG } from "@/lib/news/news-config";
import { normalizeRawArticle } from "@/lib/news/normalize";
import { FixtureNewsProvider } from "@/lib/news/providers/fixture";
import { NaverNewsProvider } from "@/lib/news/providers/naver";
import { NEWS_CATEGORIES, SourceArticleSchema, type NewsProvider } from "@/lib/news/types";
import { isOnKstDate } from "@/lib/time/kst";

export function configuredNewsProvider(): NewsProvider {
  if (process.env.DEMO_MODE === "true" || process.env.NEWS_PROVIDER === "fixture") {
    return new FixtureNewsProvider();
  }
  return new NaverNewsProvider();
}

export async function collectNewsCandidates(
  sourceDate: string,
  provider: NewsProvider = configuredNewsProvider(),
) {
  const byUrl = new Map<string, ReturnType<typeof SourceArticleSchema.parse>>();

  for (const category of NEWS_CATEGORIES) {
    for (const query of NEWS_CONFIG[category]) {
      const rawArticles = await provider.search({ category, query, sourceDate });
      for (const raw of rawArticles) {
        if (!isOnKstDate(raw.publishedAt, sourceDate)) continue;
        const normalized = SourceArticleSchema.parse(
          normalizeRawArticle({ raw, provider: provider.name, category, query, sourceDate }),
        );
        if (!byUrl.has(normalized.canonicalUrl)) {
          byUrl.set(normalized.canonicalUrl, normalized);
        }
      }
    }
  }

  return [...byUrl.values()].sort((a, b) => a.id.localeCompare(b.id));
}
