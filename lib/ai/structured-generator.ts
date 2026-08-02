import {
  createOpenRouter,
  type OpenRouterProviderOptions,
} from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import type { z } from "zod";

export interface StructuredGenerator {
  generate<T>(input: {
    schema: z.ZodType<T>;
    prompt: string;
    correction?: string;
  }): Promise<unknown>;
}

export class AiSdkStructuredGenerator implements StructuredGenerator {
  async generate<T>(input: {
    schema: z.ZodType<T>;
    prompt: string;
    correction?: string;
  }) {
    const model = process.env.AI_MODEL;
    if (!model) throw new Error("AI_MODEL이 설정되지 않았습니다.");
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY가 설정되지 않았습니다.");

    const openrouter = createOpenRouter({ apiKey });

    const { output } = await generateText({
      model: openrouter.chat(model, {
        provider: { require_parameters: true },
      }),
      maxRetries: 0,
      timeout: { totalMs: 60_000 },
      maxOutputTokens: 4096,
      providerOptions: {
        openrouter: {
          reasoning: { effort: "low", exclude: true },
        } satisfies OpenRouterProviderOptions,
      },
      output: Output.object({ schema: input.schema }),
      prompt: input.correction
        ? `${input.prompt}\n\n이전 응답 수정 지시:\n${input.correction}`
        : input.prompt,
    });
    return output;
  }
}
