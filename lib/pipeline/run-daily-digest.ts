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
  const pipelineStartedAt = Date.now();
  const sourceDate = options.sourceDate ?? previousKstDate();
  const logStage = (stage: string, details: Record<string, unknown> = {}) => {
    console.log(JSON.stringify({ stage, sourceDate, elapsedMs: Date.now() - pipelineStartedAt, ...details }));
  };
  logStage("pipeline_started");
  const force = options.force === true;
  const publisher =
    options.publisher ??
    (process.env.DEMO_MODE === "true" ? demoPublisher : new PostgresDigestPublisher());
  const existing = await publisher.findPublished(sourceDate);
  if (existing && !force) {
    logStage("pipeline_completed", { status: "skipped" });
    return { status: "skipped" as const, reason: "already-published", digestId: existing.id, sourceDate };
  }

  const runKey = force ? `daily:${sourceDate}:force:${crypto.randomUUID()}` : `daily:${sourceDate}:v1`;
  await publisher.startRun(runKey, sourceDate);
  try {
    logStage("news_collection_started", { runKey });
    const articles = await collectNewsCandidates(
      sourceDate,
      options.provider ?? configuredNewsProvider(),
    );
    logStage("news_collection_completed", { runKey, rawArticleCount: articles.length });
    const clusters = clusterAndRank(articles);
    const candidates = topCandidatesByCategory(clusters);
    logStage("normalize_cluster_rank_completed", { runKey, clusterCount: clusters.length });
    const summaryResults = await Promise.allSettled(
      NEWS_CATEGORIES.map((category) => {
        logStage("category_summary_started", { runKey, category });
        return summarizeStory(category, candidates[category], options.summaryGenerator);
      }),
    );
    logStage("all_category_summaries_completed", { runKey });
    const items = summaryResults.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
    if (items.length === 0) {
      const representativeError = summaryResults.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (representativeError) throw representativeError.reason;
      throw new Error("발행할 수 있는 grounded digest item이 없습니다.");
    }
    if (items.length > 10) throw new Error("digest item은 10개를 넘을 수 없습니다.");
    const nudges = await generateDailyNudges(
      { sourceDate, items },
      options.nudgeGenerator,
    );
    logStage("deterministic_nudges_completed", { runKey });
    const readingMinutes = Math.max(3, Math.ceil(items.length * 0.9));
    logStage("publish_started", { runKey });
    const digest = await publisher.publish({
      sourceDate,
      articles,
      clusters,
      items,
      nudges,
      readingMinutes,
    });
    logStage("publish_completed", { runKey });
    const metrics = {
      articleCount: articles.length,
      clusterCount: clusters.length,
      itemCount: items.length,
      nudgeCount: nudges.length,
    };
    await publisher.completeRun(runKey, metrics);
    logStage("pipeline_completed", { runKey, status: "published" });
    return { status: "published" as const, digestId: digest.id, sourceDate, metrics };
  } catch (error) {
    logStage("pipeline_failed", {
      runKey,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    await publisher.failRun(runKey, error instanceof Error ? error.message : "unknown pipeline error");
    throw error;
  }
}
