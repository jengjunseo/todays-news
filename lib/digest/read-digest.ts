import { cache } from "react";

import type { DigestItemWithSources } from "@/lib/demo/digest";
import { getDemoDigest } from "@/lib/demo/digest";
import { getPostgres } from "@/lib/db/postgres";
import { DigestItemSchema } from "@/lib/digest/schemas";
import { DailyNudgeSchema } from "@/lib/nudges/generate-daily-nudges";
import { isDemoMode } from "@/lib/config/mode";

export const getCurrentDigest = cache(async () => {
  if (isDemoMode()) return getDemoDigest();
  const sql = getPostgres();
  const digests = await sql<Array<{ id: string; sourceDate: string; itemCount: number; readingMinutes: number; generatedAt: string }>>`
    select id::text, source_date::text as "sourceDate", item_count as "itemCount",
      reading_minutes as "readingMinutes", generated_at::text as "generatedAt"
    from daily_digests where status = 'published'
    order by source_date desc limit 1
  `;
  const digest = digests[0];
  if (!digest) return null;

  const [itemRows, sourceRows, nudgeRows] = await Promise.all([
    sql<Array<Record<string, unknown>>>`
      select id, cluster_id as "clusterId", category, rank, headline,
        one_line as "oneLine", overview, key_points_json as "keyPoints", analogy,
        why_it_matters as "whyItMatters", socratic_question as "socraticQuestion",
        fact_status as "factStatus", confidence::float8, source_ids_json as "sourceIds"
      from digest_items where digest_id = ${digest.id}
      order by case category
        when 'politics' then 1 when 'society' then 2 when 'science' then 3
        when 'technology' then 4 else 5 end, rank
    `,
    sql<Array<{ id: string; title: string; sourceDomain: string; canonicalUrl: string }>>`
      select id, title, source_domain as "sourceDomain", canonical_url as "canonicalUrl"
      from source_articles where target_date = ${digest.sourceDate}
    `,
    sql<Array<Record<string, unknown>>>`
      select id, type, title, notification_body as "notificationBody",
        insight_body as "insightBody", question, primary_item_id as "primaryItemId",
        secondary_item_id as "secondaryItemId", perspective_type as "perspectiveType",
        scheduled_for::text as "scheduledFor", status
      from daily_nudges where digest_id = ${digest.id}
      order by scheduled_for
    `,
  ]);
  const sourceById = new Map(sourceRows.map((source) => [source.id, source]));
  const items: DigestItemWithSources[] = itemRows.map((row) => {
    const item = DigestItemSchema.parse(row);
    return {
      ...item,
      sources: item.sourceIds.flatMap((id) => {
        const source = sourceById.get(id);
        return source
          ? [{ id, title: source.title, domain: source.sourceDomain, url: source.canonicalUrl }]
          : [];
      }),
    };
  });
  const nudges = nudgeRows.map((row) => DailyNudgeSchema.parse(row));
  return {
    ...digest,
    status: "published" as const,
    items,
    nudges,
  };
});

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
