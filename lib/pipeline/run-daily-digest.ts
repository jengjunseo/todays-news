import type { StructuredGenerator } from "@/lib/ai/structured-generator";
import { summarizeStory } from "@/lib/digest/summarize-story";
import { clusterAndRank, topCandidatesByCategory } from "@/lib/news/cluster";
import { collectNewsCandidates, configuredNewsProvider } from "@/lib/news/collect";
import { NEWS_CATEGORIES, type NewsProvider } from "@/lib/news/types";
import { generateDailyNudges } from "@/lib/nudges/generate-daily-nudges";
import {
  MemoryDigestPublisher,
  PostgresDigestPublisher,
  type DigestPublisher,
} from "@/lib/pipeline/digest-publisher";
import { previousKstDate } from "@/lib/time/kst";

const demoPublisher = new MemoryDigestPublisher();

export async function runDailyDigest(options: {
  sourceDate?: string;
  force?: boolean;
  provider?: NewsProvider;
  publisher?: DigestPublisher;
  summaryGenerator?: StructuredGenerator;
  nudgeGenerator?: StructuredGenerator;
} = {}) {
  const sourceDate = options.sourceDate ?? previousKstDate();
  const force = options.force === true;
  const publisher =
    options.publisher ??
    (process.env.DEMO_MODE === "true" ? demoPublisher : new PostgresDigestPublisher());
  const existing = await publisher.findPublished(sourceDate);
  if (existing && !force) {
    return { status: "skipped" as const, reason: "already-published", digestId: existing.id, sourceDate };
  }

  const runKey = force ? `daily:${sourceDate}:force:${crypto.randomUUID()}` : `daily:${sourceDate}:v1`;
  await publisher.startRun(runKey, sourceDate);
  try {
    const articles = await collectNewsCandidates(
      sourceDate,
      options.provider ?? configuredNewsProvider(),
    );
    const clusters = clusterAndRank(articles);
    const candidates = topCandidatesByCategory(clusters);
    const items = (
      await Promise.all(
        NEWS_CATEGORIES.map((category) =>
          summarizeStory(category, candidates[category], options.summaryGenerator),
        ),
      )
    ).flat();
    if (items.length === 0) throw new Error("발행할 수 있는 grounded digest item이 없습니다.");
    if (items.length > 10) throw new Error("digest item은 10개를 넘을 수 없습니다.");
    const nudges = await generateDailyNudges(
      { sourceDate, items },
      options.nudgeGenerator,
    );
    const readingMinutes = Math.max(3, Math.ceil(items.length * 0.9));
    const digest = await publisher.publish({
      sourceDate,
      articles,
      clusters,
      items,
      nudges,
      readingMinutes,
    });
    const metrics = {
      articleCount: articles.length,
      clusterCount: clusters.length,
      itemCount: items.length,
      nudgeCount: nudges.length,
    };
    await publisher.completeRun(runKey, metrics);
    return { status: "published" as const, digestId: digest.id, sourceDate, metrics };
  } catch (error) {
    await publisher.failRun(runKey, error instanceof Error ? error.message : "unknown pipeline error");
    throw error;
  }
}
