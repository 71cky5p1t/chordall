// Shared Claude client setup for the AI routes.

import Anthropic from "@anthropic-ai/sdk";

// Default to Opus 5; override with CHORDALL_AI_MODEL (e.g. claude-haiku-4-5 to save cost).
export const MODEL = process.env.CHORDALL_AI_MODEL || "claude-opus-5";

/**
 * `output_config.effort` is only accepted by Opus 4.5+, Opus 5, Sonnet 4.6+,
 * Sonnet 5, Fable/Mythos. Haiku 4.5 and Sonnet 4.5 reject it with a 400
 * ("This model does not support the effort parameter").
 */
export function supportsEffort(model: string): boolean {
  return /claude-(opus-(4-[5-9]|5)|sonnet-(4-[6-9]|5)|fable|mythos)/.test(model);
}

// Non-streaming params so the overload resolves to a plain Message (not a Stream).
type CreateParams = Anthropic.MessageCreateParamsNonStreaming;

/**
 * messages.create with low effort where supported. If the API still rejects
 * `effort` (an unknown/new model), retry once without it rather than failing.
 */
export async function createLowEffort(
  client: Anthropic,
  params: Omit<CreateParams, "output_config">,
): Promise<Anthropic.Message> {
  const withEffort = supportsEffort(MODEL);
  try {
    return await client.messages.create({ ...params, ...(withEffort ? { output_config: { effort: "low" } } : {}) } as CreateParams);
  } catch (e) {
    const msg = String((e as { message?: string }).message ?? "");
    if (withEffort && /effort parameter/i.test(msg)) {
      return await client.messages.create(params as CreateParams);
    }
    throw e;
  }
}
