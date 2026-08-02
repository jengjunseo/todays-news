import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  google: vi.fn(),
  object: vi.fn(),
}));

vi.mock("@ai-sdk/google", () => ({ google: mocks.google }));
vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: mocks.object },
}));

import { AiSdkStructuredGenerator } from "@/lib/ai/structured-generator";

describe("AiSdkStructuredGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AI_MODEL", "gemini-3.5-flash");
  });

  it("uses the direct Google provider with structured output", async () => {
    const schema = z.object({ ok: z.boolean() });
    const googleModel = { provider: "google.generative-ai" };
    const output = { ok: true };
    const outputFormat = { type: "object" };
    mocks.google.mockReturnValue(googleModel);
    mocks.object.mockReturnValue(outputFormat);
    mocks.generateText.mockResolvedValue({ output });

    const result = await new AiSdkStructuredGenerator().generate({
      schema,
      prompt: "Return true.",
    });

    expect(mocks.google).toHaveBeenCalledOnce();
    expect(mocks.google).toHaveBeenCalledWith("gemini-3.5-flash");
    expect(mocks.object).toHaveBeenCalledWith({ schema });
    expect(mocks.generateText).toHaveBeenCalledWith({
      model: googleModel,
      output: outputFormat,
      prompt: "Return true.",
    });
    expect(result).toEqual(output);
  });
});
