import { z } from 'zod';

export interface ModelUsage { model: string; inputTokens: number; outputTokens: number }
export interface ModelOptions {
  apiKey?: string;
  model?: string;
  fetch?: typeof fetch;
  onUsage?: (usage: ModelUsage) => void | Promise<void>;
}

export class TasteError extends Error {
  constructor(public readonly code: 'CONFIGURATION' | 'PROVIDER' | 'INVALID_RESPONSE' | 'INVALID_INPUT', message: string) {
    super(message);
    this.name = 'TasteError';
  }
}

// Anthropic supports a subset of JSON Schema. Keep bounds in local validation.
function providerSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(providerSchema);
  if (!value || typeof value !== 'object') return value;
  const omitted = new Set(['$schema', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'format', 'default']);
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!omitted.has(key)) result[key] = providerSchema(child);
  }
  if (result.type === 'object') result.additionalProperties = false;
  return result;
}

export async function structuredCall<T>(schema: z.ZodType<T>, system: string, input: unknown, options: ModelOptions, defaultModel: string): Promise<T> {
  if (!options.apiKey?.trim()) throw new TasteError('CONFIGURATION', 'Taste interpretation is not configured.');
  const model = options.model || defaultModel;
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': options.apiKey },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: JSON.stringify({ untrusted_data: input }) }],
        output_config: { format: { type: 'json_schema', schema: providerSchema(z.toJSONSchema(schema)) } },
      }),
    });
  } catch {
    throw new TasteError('PROVIDER', 'Taste interpretation could not connect. Your answers have not been discarded.');
  }
  if (!response.ok) throw new TasteError('PROVIDER', `Taste provider returned HTTP ${response.status}.`);
  let body: { stop_reason?: string; content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  try {
    body = z.object({ stop_reason: z.string().nullable().optional(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(), usage: z.object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() }).optional() }).parse(await response.json()) as typeof body;
  } catch { throw new TasteError('INVALID_RESPONSE', 'Taste provider returned an unreadable response.'); }
  const inputTokens = body.usage?.input_tokens;
  const outputTokens = body.usage?.output_tokens;
  // Account for billable responses even when their content fails validation.
  if (typeof inputTokens === 'number' && Number.isFinite(inputTokens) && inputTokens >= 0 && typeof outputTokens === 'number' && Number.isFinite(outputTokens) && outputTokens >= 0) {
    await options.onUsage?.({ model, inputTokens, outputTokens });
  }
  if (body.stop_reason !== 'end_turn') throw new TasteError('INVALID_RESPONSE', 'Taste interpretation was incomplete. Please retry.');
  const text = body.content?.filter(block => block.type === 'text').map(block => block.text ?? '').join('');
  try { return schema.parse(JSON.parse(text || '')); } catch { throw new TasteError('INVALID_RESPONSE', 'Taste provider returned an invalid interpretation. Please retry.'); }
}
