import { rejectUnauthorized } from "@/lib/auth/api-guard";

export async function GET() {
  const unauthorized = await rejectUnauthorized();
  if (unauthorized) return unauthorized;
  return Response.json({ digest: null });
}
