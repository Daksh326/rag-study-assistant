import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

// Models that accept the server-side `fallbacks: "default"` refusal fallback.
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export function llmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** A short, human-readable reason for an LLM failure (the API's message, not its raw JSON). */
export function describeLlmError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const body = err.error as { error?: { message?: string } } | undefined;
    const reason = body?.error?.message ?? err.message;
    if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key is invalid. Check ANTHROPIC_API_KEY.";
    if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API. Try again in a moment.";
    return `Anthropic API error (${err.status ?? "network"}): ${reason}`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

let client: Anthropic | undefined;

export function streamAnswer(params: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  signal?: AbortSignal;
}) {
  client ??= new Anthropic();
  const useFallbacks = FALLBACK_MODELS.has(MODEL);
  return client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 16000,
      // Answers are short and grounded in the given sources, so low effort keeps them fast and cheap.
      output_config: { effort: "low" },
      system: params.system,
      messages: params.messages,
      ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal: params.signal },
  );
}
