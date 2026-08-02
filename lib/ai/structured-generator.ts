import { google } from "@ai-sdk/google";
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

    const { output } = await generateText({
      model: google(model),
      output: Output.object({ schema: input.schema }),
      prompt: input.correction
        ? `${input.prompt}\n\n이전 응답 수정 지시:\n${input.correction}`
        : input.prompt,
    });
    return output;
  }
}
