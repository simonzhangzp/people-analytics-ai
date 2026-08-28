import { z } from "zod";

export type LLMProviderErrorCode =
  | "not_configured"
  | "quota_unconfigured"
  | "auth_required"
  | "quota_exceeded"
  | "quota_unverified"
  | "timeout"
  | "provider_error"
  | "invalid_json"
  | "schema_validation_failed"
  | "unsafe_model_output";

export class LLMProviderError extends Error {
  readonly code: LLMProviderErrorCode;
  readonly details?: string[];

  constructor(code: LLMProviderErrorCode, message: string, details?: string[]) {
    super(message);
    this.name = "LLMProviderError";
    this.code = code;
    this.details = details;
  }
}

export interface StructuredGenerationRequest<T> {
  schema: z.ZodType<T>;
  schemaName: string;
  systemPrompt: string;
  input: unknown;
}

export interface LLMProvider {
  readonly name: string;
  isConfigured(): boolean;
  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<T>;
}

interface DeepSeekProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const EXECUTABLE_SQL_PATTERN =
  /\b(?:select\b[\s\S]{0,240}\bfrom\b|insert\s+into\b|update\s+[\w".]+\s+set\b|delete\s+from\b|create\s+(?:table|view|index)\b|drop\s+(?:table|view|index)\b|alter\s+table\b|with\s+[\w"]+\s+as\s*\()/i;

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 12).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return `${path}: ${issue.message}`;
  });
}

function assertNoExecutableSql(value: unknown, path = "<root>"): void {
  if (typeof value === "string") {
    if (EXECUTABLE_SQL_PATTERN.test(value)) {
      throw new LLMProviderError(
        "unsafe_model_output",
        "The model returned executable SQL, which Workbench does not accept.",
        [path],
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoExecutableSql(item, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (normalizedKey === "sql" || normalizedKey === "sqlquery") {
      throw new LLMProviderError(
        "unsafe_model_output",
        "The model returned an SQL field, which Workbench does not accept.",
        [`${path}.${key}`],
      );
    }
    assertNoExecutableSql(child, `${path}.${key}`);
  }
}

function parseJsonOnly(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed || trimmed.startsWith("```") || trimmed.endsWith("```")) {
    throw new LLMProviderError(
      "invalid_json",
      "DeepSeek did not return a JSON-only response.",
    );
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new LLMProviderError(
      "invalid_json",
      "DeepSeek returned malformed JSON.",
    );
  }
}

export class DeepSeekProvider implements LLMProvider {
  readonly name = "deepseek";

  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: DeepSeekProviderOptions = {}) {
    this.apiKey = options.apiKey?.trim() || undefined;
    this.baseUrl = (options.baseUrl?.trim() || "https://api.deepseek.com").replace(
      /\/+$/,
      "",
    );
    this.model = options.model?.trim() || "deepseek-chat";
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generateStructured<T>({
    schema,
    schemaName,
    systemPrompt,
    input,
  }: StructuredGenerationRequest<T>): Promise<T> {
    if (!this.apiKey) {
      throw new LLMProviderError(
        "not_configured",
        "DeepSeek is not configured on the server.",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(
        `${this.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.model,
            temperature: 0.1,
            max_tokens: 4_096,
            stream: false,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: [
                  "You are the typed People Analytics Workbench co-designer.",
                  "Return exactly one JSON object and no markdown or commentary.",
                  "Never request, infer, or reproduce raw employee-level rows or sample values.",
                  "Never return executable SQL, SQL fragments, or a field named sql.",
                  "Use only the supplied safe profiles, approved definitions, and aggregate evidence.",
                  "Clearly separate assumptions and missing evidence from supported conclusions.",
                  systemPrompt,
                ].join(" "),
              },
              {
                role: "user",
                content: JSON.stringify({
                  task: schemaName,
                  input,
                  outputSchema: z.toJSONSchema(schema),
                }),
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        throw new LLMProviderError(
          "provider_error",
          `DeepSeek request failed with status ${response.status}.`,
        );
      }

      let payload: DeepSeekResponse;
      try {
        payload = (await response.json()) as DeepSeekResponse;
      } catch {
        throw new LLMProviderError(
          "provider_error",
          "DeepSeek returned an unreadable response.",
        );
      }

      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new LLMProviderError(
          "provider_error",
          "DeepSeek response did not contain structured content.",
        );
      }

      const candidate = parseJsonOnly(content);
      assertNoExecutableSql(candidate);

      const parsed = schema.safeParse(candidate);
      if (!parsed.success) {
        throw new LLMProviderError(
          "schema_validation_failed",
          "DeepSeek JSON did not match the required task schema.",
          formatZodIssues(parsed.error),
        );
      }

      return parsed.data;
    } catch (error) {
      if (error instanceof LLMProviderError) throw error;
      if (controller.signal.aborted) {
        throw new LLMProviderError(
          "timeout",
          `DeepSeek did not respond within ${this.timeoutMs}ms.`,
        );
      }
      throw new LLMProviderError(
        "provider_error",
        "DeepSeek could not complete the request.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createDeepSeekProviderFromEnv(): DeepSeekProvider {
  if (typeof window !== "undefined") {
    throw new LLMProviderError(
      "not_configured",
      "DeepSeek credentials are server-only.",
    );
  }

  return new DeepSeekProvider({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL,
    model: process.env.DEEPSEEK_MODEL,
  });
}
