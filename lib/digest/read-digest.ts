import { cache } from "react";
import { z } from "zod";

import { isDemoMode } from "@/lib/config/mode";
import { getPostgres } from "@/lib/db/postgres";
import type { DigestItemWithSources } from "@/lib/demo/digest";
import { getDemoDigest } from "@/lib/demo/digest";
import { DigestItemSchema } from "@/lib/digest/schemas";

type DigestHeader = {
  id: string;
  sourceDate: string;
  itemCount: number;
  readingMinutes: number;
  generatedAt: string;
};

export type DigestForView = DigestHeader & {
  status: "published";
  items: DigestItemWithSources[];
};

const CurrentInsightNudgeViewSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["morning", "perspective", "evening"]),
  title: z.string().min(1),
  insightBody: z.string().min(1),
  question: z.string().min(1),
});

export type CurrentInsightNudgeView = z.infer<typeof CurrentInsightNudgeViewSchema>;

function logReadTiming(stage: string, startedAt: number, rowCount: number) {
  console.log(JSON.stringify({ stage, elapsedMs: Date.now() - startedAt, rowCount }));
}

async function readDigestItems(
  digest: DigestHeader,
  stagePrefix: "current_digest" | "archive_digest",
): Promise<DigestForView> {
  const sql = getPostgres();
  const itemsStartedAt = Date.now();
  const itemRows = await sql<Array<Record<string, unknown>>>`
    select id, cluster_id as "clusterId", category, rank, headline,
      one_line as "oneLine", overview, key_points_json as "keyPoints", analogy,
      why_it_matters as "whyItMatters", socratic_question as "socraticQuestion",
      fact_status as "factStatus", confidence::float8, source_ids_json as "sourceIds"
    from digest_items where digest_id = ${digest.id}
    order by case category
      when 'politics' then 1 when 'society' then 2 when 'science' then 3
      when 'technology' then 4 else 5 end, rank
  `;
  logReadTiming(`${stagePrefix}_items_ms`, itemsStartedAt, itemRows.length);

  const parsedItems = itemRows.map((row) => DigestItemSchema.parse(row));
  const sourceIds = [...new Set(parsedItems.flatMap((item) => item.sourceIds))];
  const sourcesStartedAt = Date.now();
  const sourceRows = sourceIds.length
    ? await sql<Array<{ id: string; title: string; sourceDomain: string; canonicalUrl: string }>>`
        select id, title, source_domain as "sourceDomain", canonical_url as "canonicalUrl"
        from source_articles where id in ${sql(sourceIds)}
      `
    : [];
  logReadTiming(`${stagePrefix}_sources_ms`, sourcesStartedAt, sourceRows.length);

  const sourceById = new Map(sourceRows.map((source) => [source.id, source]));
  const items: DigestItemWithSources[] = parsedItems.map((item) => ({
    ...item,
    sources: item.sourceIds.flatMap((id) => {
      const source = sourceById.get(id);
      return source
        ? [{ id, title: source.title, domain: source.sourceDomain, url: source.canonicalUrl }]
        : [];
    }),
  }));

  return { ...digest, status: "published", items };
}

export const getCurrentDigest = cache(async (): Promise<DigestForView | null> => {
  const totalStartedAt = Date.now();
  if (isDemoMode()) {
    const { nudges: _nudges, ...digest } = await getDemoDigest();
    logReadTiming("current_digest_total_ms", totalStartedAt, digest.items.length);
    return digest;
  }

  const sql = getPostgres();
  const headerStartedAt = Date.now();
  const digests = await sql<DigestHeader[]>`
    select id::text, source_date::text as "sourceDate", item_count as "itemCount",
      reading_minutes as "readingMinutes", generated_at::text as "generatedAt"
    from daily_digests where status = 'published'
    order by source_date desc limit 1
  `;
  logReadTiming("current_digest_header_ms", headerStartedAt, digests.length);
  const digest = digests[0];
  if (!digest) {
    logReadTiming("current_digest_total_ms", totalStartedAt, 0);
    return null;
  }

  const result = await readDigestItems(digest, "current_digest");
  logReadTiming("current_digest_total_ms", totalStartedAt, result.items.length);
  return result;
});

export const getCurrentInsightDigest = cache(async () => {
  const totalStartedAt = Date.now();
  if (isDemoMode()) {
    const digest = await getDemoDigest();
    const nudges = digest.nudges.map((nudge) => CurrentInsightNudgeViewSchema.parse(nudge));
    logReadTiming("insights_total_ms", totalStartedAt, nudges.length);
    return { id: digest.id, sourceDate: digest.sourceDate, nudges };
  }

  const sql = getPostgres();
  const headerStartedAt = Date.now();
  const digests = await sql<Array<Pick<DigestHeader, "id" | "sourceDate">>>`
    select id::text, source_date::text as "sourceDate"
    from daily_digests where status = 'published'
    order by source_date desc limit 1
  `;
  logReadTiming("insights_digest_header_ms", headerStartedAt, digests.length);
  const digest = digests[0];
  if (!digest) {
    logReadTiming("insights_total_ms", totalStartedAt, 0);
    return null;
  }

  const nudgesStartedAt = Date.now();
  const nudgeRows = await sql<Array<Record<string, unknown>>>`
    select id, type, title, insight_body as "insightBody", question
    from daily_nudges where digest_id = ${digest.id}
    order by scheduled_for
  `;
  const nudges = nudgeRows.map((row) => CurrentInsightNudgeViewSchema.parse(row));
  logReadTiming("insights_nudges_ms", nudgesStartedAt, nudges.length);
  logReadTiming("insights_total_ms", totalStartedAt, nudges.length);
  return { ...digest, nudges };
});

export const getPublishedDigestBySourceDate = cache(
  async (sourceDate: string): Promise<DigestForView | null> => {
    const totalStartedAt = Date.now();
    if (isDemoMode()) {
      const { nudges: _nudges, ...digest } = await getDemoDigest();
      const result = digest.sourceDate === sourceDate ? digest : null;
      logReadTiming("archive_digest_total_ms", totalStartedAt, result?.items.length ?? 0);
      return result;
    }

    const sql = getPostgres();
    const headerStartedAt = Date.now();
    const digests = await sql<DigestHeader[]>`
      select id::text, source_date::text as "sourceDate", item_count as "itemCount",
        reading_minutes as "readingMinutes", generated_at::text as "generatedAt"
      from daily_digests
      where status = 'published' and source_date = ${sourceDate}
      limit 1
    `;
    logReadTiming("archive_digest_header_ms", headerStartedAt, digests.length);
    const digest = digests[0];
    if (!digest) {
      logReadTiming("archive_digest_total_ms", totalStartedAt, 0);
      return null;
    }

    const result = await readDigestItems(digest, "archive_digest");
    logReadTiming("archive_digest_total_ms", totalStartedAt, result.items.length);
    return result;
  },
);

export async function listPublishedDigests() {
  if (isDemoMode()) {
    const digest = await getDemoDigest();
    return [digest];
  }
  const sql = getPostgres();
  return sql<Array<{ id: string; sourceDate: string; itemCount: number; readingMinutes: number }>>`
    select id::text, source_date::text as "sourceDate", item_count as "itemCount",
      reading_minutes as "readingMinutes"
    from daily_digests where status = 'published' order by source_date desc
  `;
}
