import { describe, expect, it, vi } from "vitest";

import { getSetupDiagnostics } from "@/lib/diagnostics/setup";

describe("demo mode setup diagnostics", () => {
  it("reports useful status without exposing secret values", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "do-not-expose-supabase-secret");
    vi.stubEnv("AI_GATEWAY_API_KEY", "do-not-expose-ai-secret");
    vi.stubEnv("VAPID_PRIVATE_KEY", "do-not-expose-vapid-secret");
    const diagnostics = await getSetupDiagnostics();
    const serialized = JSON.stringify(diagnostics);
    expect(diagnostics.database).toBe("데모 저장소");
    expect(serialized).not.toContain("do-not-expose");
  });
});
