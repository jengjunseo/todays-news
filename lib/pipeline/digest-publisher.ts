import type { DigestItem } from "@/lib/digest/schemas";
import { getPostgres } from "@/lib/db/postgres";
import type { StoryCluster } from "@/lib/news/cluster";
import type { SourceArticle } from "@/lib/news/types";
import type { DailyNudge } from "@/lib/nudges/generate-daily-nudges";

export type PublishBundle = {
  sourceDate: string;
  articles: SourceArticle[];
  clusters: StoryCluster[];
  items: DigestItem[];
  nudges: DailyNudge[];
  readingMinutes: number;
};

export interface DigestPublisher {
  findPublished(sourceDate: string): Promise<{ id: string } | null>;
  startRun(runKey: string, sourceDate: string): Promise<void>;
  completeRun(runKey: string, metrics: Record<string, unknown>): Promise<void>;
  failRun(runKey: string, error: string): Promise<void>;
  publish(bundle: PublishBundle): Promise<{ id: string }>;
}

export class PostgresDigestPublisher implements DigestPublisher {
  private readonly sql = getPostgres();

  async findPublished(sourceDate: string) {
    const rows = await this.sql<{ id: string }[]>`
      select id::text as id from daily_digests
      where source_date = ${sourceDate} and status = 'published'
      limit 1
    `;
    return rows[0] ?? null;
  }

  async startRun(runKey: string, sourceDate: string) {
    await this.sql`
      insert into pipeline_runs (run_key, source_date, status, started_at, metrics_json)
      values (${runKey}, ${sourceDate}, 'running', now(), '{}'::jsonb)
      on conflict (run_key) do update set
        status = 'running', started_at = now(), completed_at = null, error_message = null
    `;
  }

  async completeRun(runKey: string, metrics: Record<string, unknown>) {
    await this.sql`
      update pipeline_runs set status = 'published', completed_at = now(), metrics_json = ${JSON.stringify(metrics)}::jsonb
      where run_key = ${runKey}
    `;
  }

  async failRun(runKey: string, error: string) {
    await this.sql`
      update pipeline_runs set status = 'failed', completed_at = now(), error_message = ${error.slice(0, 2000)}
      where run_key = ${runKey}
    `;
  }

  async publish(bundle: PublishBundle) {
    return this.sql.begin(async (tx) => {
      for (const article of bundle.articles) {
        await tx`
          insert into source_articles (
            id, provider, category, query, title, normalized_title, description,
            canonical_url, provider_url, source_domain, published_at, target_date
          ) values (
            ${article.id}, ${article.provider}, ${article.category}, ${article.query},
            ${article.title}, ${article.normalizedTitle}, ${article.description},
            ${article.canonicalUrl}, ${article.providerUrl}, ${article.sourceDomain},
            ${article.publishedAt}, ${article.targetDate}
          ) on conflict (id) do update set
            query = excluded.query, title = excluded.title, description = excluded.description,
            provider_url = excluded.provider_url, published_at = excluded.published_at
        `;
      }

      for (const cluster of bundle.clusters) {
        await tx`
          insert into story_clusters (
            id, category, target_date, representative_title, deterministic_score,
            article_count, source_count
          ) values (
            ${cluster.id}, ${cluster.category}, ${cluster.targetDate},
            ${cluster.representativeTitle}, ${cluster.deterministicScore},
            ${cluster.articleCount}, ${cluster.sourceCount}
          ) on conflict (id) do update set
            representative_title = excluded.representative_title,
            deterministic_score = excluded.deterministic_score,
            article_count = excluded.article_count,
            source_count = excluded.source_count
        `;
        for (const article of cluster.articles) {
          await tx`
            insert into cluster_articles (cluster_id, article_id)
            values (${cluster.id}, ${article.id})
            on conflict do nothing
          `;
        }
      }

      const digestRows = await tx<{ id: string }[]>`
        insert into daily_digests (
          source_date, status, item_count, reading_minutes, generated_at, updated_at
        ) values (
          ${bundle.sourceDate}, 'generating', ${bundle.items.length},
          ${bundle.readingMinutes}, now(), now()
        ) on conflict (source_date) do update set
          status = 'generating', item_count = excluded.item_count,
          reading_minutes = excluded.reading_minutes, generated_at = now(), updated_at = now()
        returning id::text as id
      `;
      const digestId = digestRows[0]!.id;

      await tx`delete from daily_nudges where digest_id = ${digestId}`;
      await tx`delete from digest_items where digest_id = ${digestId}`;

      for (const item of bundle.items) {
        await tx`
          insert into digest_items (
            id, digest_id, cluster_id, category, rank, headline, one_line, overview,
            key_points_json, analogy, why_it_matters, socratic_question,
            fact_status, confidence, source_ids_json
          ) values (
            ${item.id}, ${digestId}, ${item.clusterId}, ${item.category}, ${item.rank},
            ${item.headline}, ${item.oneLine}, ${item.overview}, ${tx.json(item.keyPoints)},
            ${item.analogy}, ${item.whyItMatters}, ${item.socraticQuestion},
            ${item.factStatus}, ${item.confidence}, ${tx.json(item.sourceIds)}
          )
        `;
      }

      for (const nudge of bundle.nudges) {
        await tx`
          insert into daily_nudges (
            id, digest_id, type, title, notification_body, insight_body, question,
            primary_item_id, secondary_item_id, perspective_type, scheduled_for, status
          ) values (
            ${nudge.id}, ${digestId}, ${nudge.type}, ${nudge.title}, ${nudge.notificationBody},
            ${nudge.insightBody}, ${nudge.question}, ${nudge.primaryItemId},
            ${nudge.secondaryItemId}, ${nudge.perspectiveType}, ${nudge.scheduledFor}, 'pending'
          )
        `;
      }

      await tx`
        update daily_digests set
          status = 'published', published_at = now(), updated_at = now(),
          item_count = ${bundle.items.length}, reading_minutes = ${bundle.readingMinutes}
        where id = ${digestId}
      `;
      return { id: digestId };
    });
  }
}

export class MemoryDigestPublisher implements DigestPublisher {
  readonly published = new Map<string, PublishBundle>();
  readonly runs = new Map<string, { status: string; metrics?: Record<string, unknown>; error?: string }>();

  async findPublished(sourceDate: string) {
    return this.published.has(sourceDate) ? { id: `memory-${sourceDate}` } : null;
  }
  async startRun(runKey: string) {
    this.runs.set(runKey, { status: "running" });
  }
  async completeRun(runKey: string, metrics: Record<string, unknown>) {
    this.runs.set(runKey, { status: "published", metrics });
  }
  async failRun(runKey: string, error: string) {
    this.runs.set(runKey, { status: "failed", error });
  }
  async publish(bundle: PublishBundle) {
    this.published.set(bundle.sourceDate, structuredClone(bundle));
    return { id: `memory-${bundle.sourceDate}` };
  }
}
