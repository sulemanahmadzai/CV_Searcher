import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-5-5";

// Claude Sonnet 5.5 list prices (USD per million tokens), used for the cost display.
const PRICE = { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 };

// Server-side refusal fallback: if the model declines a request for policy
// reasons, the API retries it on its default fallback model in the same call.
export const FALLBACK_PARAMS = {
  betas: ["server-side-fallback-2026-07-01"] as string[],
  fallbacks: "default" as const,
};

let client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local.");
  }
  client ??= new Anthropic({ maxRetries: 6, timeout: 10 * 60 * 1000 });
  return client;
}

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cost_usd: number;
};

type RawUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function toUsage(u: RawUsage): Usage {
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cost =
    (u.input_tokens * PRICE.input +
      u.output_tokens * PRICE.output +
      cacheRead * PRICE.cacheRead +
      cacheWrite * PRICE.cacheWrite) /
    1_000_000;
  return {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: cacheWrite,
    cost_usd: Math.round(cost * 10000) / 10000,
  };
}

export function addUsage(a: Usage | null, b: Usage): Usage {
  if (!a) return b;
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
    cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
    cost_usd: Math.round((a.cost_usd + b.cost_usd) * 10000) / 10000,
  };
}

/** Throws a readable error when a response can't be used. */
export function assertUsable(stopReason: string | null, parsed: unknown): void {
  if (stopReason === "refusal") throw new Error("Claude declined to process this document.");
  if (stopReason === "max_tokens") throw new Error("Claude's answer was cut off (document too long).");
  if (parsed == null) throw new Error("Claude's answer did not match the expected format.");
}
