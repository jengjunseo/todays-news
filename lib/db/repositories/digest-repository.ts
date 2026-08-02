import type { SupabaseClient } from "@supabase/supabase-js";

export type DigestRecord = {
  id: string;
  source_date: string;
  status: "generating" | "published" | "failed";
  item_count: number;
  reading_minutes: number;
  generated_at: string | null;
  published_at: string | null;
};

export class DigestRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findPublishedByDate(sourceDate: string) {
    const { data, error } = await this.client
      .from("daily_digests")
      .select("id,source_date,status,item_count,reading_minutes,generated_at,published_at")
      .eq("source_date", sourceDate)
      .eq("status", "published")
      .maybeSingle();

    if (error) throw error;
    return data as DigestRecord | null;
  }

  async listPublished() {
    const { data, error } = await this.client
      .from("daily_digests")
      .select("id,source_date,status,item_count,reading_minutes,generated_at,published_at")
      .eq("status", "published")
      .order("source_date", { ascending: false });

    if (error) throw error;
    return (data ?? []) as DigestRecord[];
  }
}
