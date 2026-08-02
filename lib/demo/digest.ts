import { cache } from "react";

import { summarizeStory } from "@/lib/digest/summarize-story";
import type { DigestItem } from "@/lib/digest/schemas";
import { clusterAndRank, topCandidatesByCategory } from "@/lib/news/cluster";
import { collectNewsCandidates } from "@/lib/news/collect";
import { FixtureNewsProvider } from "@/lib/news/providers/fixture";
import { NEWS_CATEGORIES } from "@/lib/news/types";
import { generateDailyNudges } from "@/lib/nudges/generate-daily-nudges";
import { previousKstDate } from "@/lib/time/kst";

export type DigestSource = {
  id: string;
  title: string;
  domain: string;
  url: string;
};

export type DigestItemWithSources = DigestItem & { sources: DigestSource[] };

export const getDemoDigest = cache(async () => {
  const sourceDate = previousKstDate();
  const articles = await collectNewsCandidates(sourceDate, new FixtureNewsProvider());
  const clusters = clusterAndRank(articles);
  const candidates = topCandidatesByCategory(clusters);
  const previousDemoMode = process.env.DEMO_MODE;
  process.env.DEMO_MODE = "true";
  try {
    const items = (
      await Promise.all(
        NEWS_CATEGORIES.map((category) => summarizeStory(category, candidates[category])),
      )
    ).flat();
    const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));
    const itemsWithSources: DigestItemWithSources[] = items.map((item) => ({
      ...item,
      sources: (clusterById.get(item.clusterId)?.articles ?? [])
        .filter((article) => item.sourceIds.includes(article.id))
        .map((article) => ({
          id: article.id,
          title: article.title,
          domain: article.sourceDomain,
          url: article.canonicalUrl,
        })),
    }));
    const nudges = await generateDailyNudges({ sourceDate, items });
    return {
      id: `demo-${sourceDate}`,
      sourceDate,
      status: "published" as const,
      itemCount: itemsWithSources.length,
      readingMinutes: Math.max(3, Math.ceil(itemsWithSources.length * 0.9)),
      items: itemsWithSources,
      nudges,
      generatedAt: new Date(`${sourceDate}T21:45:00Z`).toISOString(),
    };
  } finally {
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
  }
});
