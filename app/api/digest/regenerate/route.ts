import { rejectUnauthorized } from "@/lib/auth/api-guard";
import { runDailyDigest } from "@/lib/pipeline/run-daily-digest";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const unauthorized = await rejectUnauthorized();
  if (unauthorized) return unauthorized;
  try {
    return Response.json(await runDailyDigest({ force: true }));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "재생성 실패" },
      { status: 500 },
    );
  }
}
