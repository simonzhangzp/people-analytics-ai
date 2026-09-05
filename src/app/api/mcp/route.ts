import { DEFAULT_IDENTITY } from "@/lib/people/demo-identities";
import { executeRegistryTool, mcpToolDescriptors } from "@/lib/people/agent/registry";
import { PEOPLE_TOOL_SET, type PeopleRegistryToolName } from "@/lib/people/agent/types";
import { timingSafeEqual, createHash } from "node:crypto";

export const runtime = "nodejs";

const PROTOCOL = "2025-03-26";
const SERVER_INFO = { name: "people-mcp", version: "1.0.0" };

function jsonRpc(id: unknown, result: unknown, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extraHeaders },
  });
}

function jsonRpcError(id: unknown, code: number, message: string, status = 200): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function tokensEqual(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorize(request: Request): boolean {
  const expected = process.env.PEOPLE_MCP_DEMO_TOKEN?.trim();
  const provided = bearerToken(request);
  if (!expected || !provided) return false;
  return tokensEqual(provided, expected);
}

type RpcBody = {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
    identity_id?: unknown;
  };
};

async function handleRpc(body: RpcBody): Promise<Response> {
  const id = body.id;
  const method = body.method ?? "";
  if (method === "initialize") {
    return jsonRpc(id, {
      protocolVersion: PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions:
        "People Analytics demo MCP. Aggregate metrics only. Identity is demo-external-viewer (min_cell 50). identity_id arguments are rejected.",
    });
  }
  if (method === "notifications/initialized" || method === "ping") {
    return jsonRpc(id, {});
  }
  if (method === "tools/list") {
    return jsonRpc(id, {
      tools: mcpToolDescriptors().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    });
  }
  if (method === "tools/call") {
    const name = body.params?.name;
    if (typeof name !== "string" || !PEOPLE_TOOL_SET.has(name)) {
      return jsonRpcError(id, -32602, "Unknown tool.");
    }
    if (body.params?.identity_id != null || body.params?.arguments?.identity_id != null) {
      return jsonRpcError(id, -32602, "identity_id is not accepted on people-mcp. Token maps to demo-external-viewer.");
    }
    const args = (body.params?.arguments ?? {}) as Record<string, string | number | null | undefined>;
    if (args.snapshot_id === "incident_replay") {
      return jsonRpcError(id, -32602, "incident_replay is not in MCP visitor scope.");
    }
    const executed = await executeRegistryTool({
      call: { name: name as PeopleRegistryToolName, args },
      identityId: DEFAULT_IDENTITY,
      purpose: "mcp",
      allowReplay: false,
    });
    if (!executed.ok) {
      return jsonRpc(id, {
        content: [{ type: "text", text: executed.error }],
        isError: true,
      });
    }
    return jsonRpc(id, {
      content: [{ type: "text", text: JSON.stringify(executed.result) }],
      structuredContent: executed.result,
      isError: false,
    });
  }
  return jsonRpcError(id, -32601, `Method not found: ${method}`);
}

export async function POST(request: Request): Promise<Response> {
  if (!authorize(request)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
    });
  }
  let body: RpcBody;
  try {
    body = (await request.json()) as RpcBody;
  } catch {
    return jsonRpcError(null, -32700, "Parse error", 400);
  }
  return handleRpc(body);
}

export async function GET(): Promise<Response> {
  return new Response("people-mcp", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
