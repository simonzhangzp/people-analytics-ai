import { analyzeStrategyBrief } from "@/lib/strategy/analyze-brief";
import { metricTemplates } from "@/lib/strategy/metric-templates";
import {
  jsonResponse,
  readGuardedAIJson,
  resolveLiveAIAccess,
} from "@/lib/ai/route-guard";
import { completeLlmBudget, gatePublicLlm } from "@/lib/people/agent/budget";
import type { MetricProposal, StrategyAnalysis, StrategyIntent } from "@/types/strategy";
import { z } from "zod";

export const runtime = "nodejs";

const strategyAnalyzeRequestSchema = z
  .object({
    kind: z.enum(["strategy", "problem"]).default("strategy"),
    title: z.string().trim().max(500).default(""),
    statement: z.string().trim().max(4_000).default(""),
    catalogId: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.statement || value.catalogId), {
    message: "Select a catalog item or write a strategy or problem statement.",
  });

function parseModelJson(text: string) {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as {
      summary?: string;
      decisions?: string[];
      assumptions?: string[];
      missingEvidence?: string[];
      metrics?: Array<{
        id?: string;
        name?: string;
        category?: MetricProposal["category"];
        definition?: string;
        measurementStandard?: string;
        formula?: string;
        unit?: string;
        suggestedTarget?: string;
      }>;
    };
  } catch {
    return null;
  }
}

function mergeAiMetrics(
  fallback: MetricProposal[],
  incoming: NonNullable<ReturnType<typeof parseModelJson>>["metrics"],
): MetricProposal[] {
  if (!incoming || incoming.length === 0) return fallback;
  const byName = new Map(fallback.map((metric) => [metric.name.toLowerCase(), metric]));
  const merged = [...fallback];
  for (const item of incoming) {
    const name = item.name?.trim();
    if (!name) continue;
    const existing = byName.get(name.toLowerCase());
    if (existing) {
      existing.definition = item.definition?.trim() || existing.definition;
      existing.measurementStandard =
        item.measurementStandard?.trim() || existing.measurementStandard;
      existing.suggestedTarget = item.suggestedTarget?.trim() || existing.suggestedTarget;
      existing.origin = "ai";
      continue;
    }
    const template = item.id ? metricTemplates[item.id] : undefined;
    merged.push({
      id: template?.id ?? `ai-${merged.length + 1}`,
      name,
      category: item.category ?? template?.category ?? "Driver",
      definition: item.definition?.trim() || template?.definition || "Definition needs human confirmation.",
      measurementStandard:
        item.measurementStandard?.trim() ||
        template?.measurementStandard ||
        "Measurement standard needs human confirmation.",
      formula: item.formula?.trim() || template?.formula || "To be confirmed",
      unit: item.unit?.trim() || template?.unit || "",
      requiredFields: template?.requiredFields ?? [],
      suggestedTarget: item.suggestedTarget?.trim() || template?.suggestedTarget || "",
      target: "",
      confidence: template?.confidence ?? "Low",
      status: "Proposed",
      origin: "ai",
    });
  }
  return merged.slice(0, 8);
}

async function callDeepSeek(kind: StrategyIntent, title: string, statement: string) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a People Strategy co-designer. Return JSON only. Never invent current numeric baselines. Distinguish outcome, guardrail, and driver metrics. Mark assumptions and missing evidence. Do not use protected attributes as action drivers. Do not request raw employee rows.",
          },
          {
            role: "user",
            content: JSON.stringify({
              kind,
              title,
              statement,
              required_keys: [
                "summary",
                "decisions",
                "assumptions",
                "missingEvidence",
                "metrics",
              ],
              metric_keys: [
                "name",
                "category",
                "definition",
                "measurementStandard",
                "formula",
                "unit",
                "suggestedTarget",
              ],
            }),
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return parseModelJson(payload.choices?.[0]?.message?.content ?? "");
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const guarded = await readGuardedAIJson(request);
  if (!guarded.ok) return guarded.response;
  const parsed = strategyAnalyzeRequestSchema.safeParse(guarded.body);
  if (!parsed.success) {
    return jsonResponse(
      {
        error: {
          code: "invalid_task_input",
          message: "Request does not match the supported Strategy AI task.",
          details: parsed.error.issues.slice(0, 12).map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }
  const { kind, title, statement, catalogId } = parsed.data;

  const fallback = analyzeStrategyBrief({
    catalogId,
    kind,
    title,
    statement,
  });

  const site = await gatePublicLlm(request, "lab_strategy_analyze");
  if (!site.allowed) {
    return jsonResponse({
      brief: fallback,
      source: "catalog",
      warning: {
        code: "quota_exceeded",
        message: "Site LLM budget is exhausted; the catalog fallback was used.",
      },
    });
  }

  const access = await resolveLiveAIAccess(request);
  if (access.status === "blocked") {
    if (site.callId) {
      await completeLlmBudget({ callId: site.callId, ok: false, model: "deepseek-chat" });
    }
    return jsonResponse({
      brief: fallback,
      source: "catalog",
      warning: access.warning,
    });
  }

  const remote = await callDeepSeek(
    kind,
    title || fallback.title,
    statement || fallback.statement,
  );
  if (!remote) {
    if (site.callId) {
      await completeLlmBudget({ callId: site.callId, ok: false, model: "deepseek-chat" });
    }
    return jsonResponse({
      brief: fallback,
      source: "catalog",
      warning: {
        code: "provider_error",
        message:
          "DeepSeek could not complete the Strategy proposal; the catalog fallback was used.",
      },
    });
  }

  if (site.callId) {
    await completeLlmBudget({ callId: site.callId, ok: true, model: "deepseek-chat" });
  }

  const analysis: StrategyAnalysis = {
    summary: remote.summary?.trim() || fallback.analysis?.summary || "",
    decisions:
      remote.decisions?.filter(Boolean).slice(0, 5) ?? fallback.analysis?.decisions ?? [],
    assumptions:
      remote.assumptions?.filter(Boolean).slice(0, 4) ?? fallback.analysis?.assumptions ?? [],
    missingEvidence:
      remote.missingEvidence?.filter(Boolean).slice(0, 4) ??
      fallback.analysis?.missingEvidence ??
      [],
    source: "mixed",
    modelNote: "AI proposal · confirm definitions before they become approved knowledge",
  };

  const brief = {
    ...fallback,
    analysis,
    metrics: mergeAiMetrics(fallback.metrics, remote.metrics),
  };

  return jsonResponse({ brief, source: "deepseek" });
}
