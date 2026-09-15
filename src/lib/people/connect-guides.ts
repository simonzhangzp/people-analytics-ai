/**
 * Step-by-step MCP onboarding per client. Verified against vendor documentation on
 * 2026-09-15 (see `verifiedAgainst`). If a client cannot send a static Bearer header,
 * say so — do not pretend the connection works.
 */

export const MCP_ENDPOINT = "https://peopleanalyticsai.net/api/mcp";
export const MCP_TOKEN_PLACEHOLDER = "<PUBLIC_DEMO_TOKEN>";

export type ClientSupport =
  | "verified" // owner has connected this client end-to-end
  | "supported" // vendor docs describe a working path; not re-tested here
  | "partial" // works only through a side path (CLI, bridge, admin console)
  | "unsupported"; // this client cannot send our static Bearer header today

export type ConnectGuide = {
  id: string;
  label: string;
  support: ClientSupport;
  supportNote: string;
  verifiedAgainst: string;
  whereToGo: string[];
  whatToClick: string[];
  /** Snippet is rendered in a <pre>. Uses {{ENDPOINT}} and {{TOKEN}} placeholders. */
  whatToPaste: { language: string; body: string } | null;
  tokenPlacement: string;
  exampleQuestion: string;
  expectedResult: string[];
  permissionNotes: string[];
  troubleshooting: Array<{ symptom: string; fix: string }>;
};

const SHARED_PERMISSIONS = [
  "The token maps to demo-external-viewer: aggregate cells only, min_cell 50.",
  "Confidential metrics such as compa_ratio_median return value=null with a deny reason; the tool call still succeeds.",
  "identity_id arguments are rejected. The token cannot select another identity, run SQL, list people, or open the incident replay.",
  "It is a public demo credential, not a secret. Rotate by changing the Vercel env vars and redeploying.",
];

const SHARED_EXPECTED = [
  "The client calls get_metric with metric_id=headcount and receives value 49,823 for as_of 2026-08-31.",
  "The payload carries identity_id, snapshot pointer, and effective_min_cell. No SQL is generated on your side.",
];

export const CONNECT_GUIDES: ConnectGuide[] = [
  {
    id: "cursor",
    label: "Cursor",
    support: "verified",
    supportNote: "Connected end-to-end from Cursor with a static Authorization header.",
    verifiedAgainst: "cursor.com/docs/mcp · mcp.json remote server with headers",
    whereToGo: [
      "Cursor Settings → Tools & MCP, or open ~/.cursor/mcp.json (global) / .cursor/mcp.json (project).",
    ],
    whatToClick: [
      "New MCP Server (drops you into mcp.json).",
      "Save, then toggle the server on. Cursor detects Streamable HTTP from the url field; no transport key is needed.",
    ],
    whatToPaste: {
      language: "json",
      body: `{
  "mcpServers": {
    "people-analytics": {
      "url": "{{ENDPOINT}}",
      "headers": {
        "Authorization": "Bearer {{TOKEN}}"
      }
    }
  }
}`,
    },
    tokenPlacement:
      "headers.Authorization with the literal prefix “Bearer ” and a space. To keep it out of the file use \"Bearer ${env:PEOPLE_MCP_TOKEN}\" and set the variable in your shell profile.",
    exampleQuestion: "Using people-analytics, what is certified Headcount as of 2026-08-31?",
    expectedResult: [
      ...SHARED_EXPECTED,
      "Tools & MCP lists 15 tools under people-analytics; none of them takes identity_id.",
    ],
    permissionNotes: SHARED_PERMISSIONS,
    troubleshooting: [
      { symptom: "Server shows “Failed to connect”.", fix: "The url must end in /api/mcp, not /connect. GET returns the text people-mcp; POST without the header returns 401." },
      { symptom: "401 unauthorized.", fix: "The header value must start with “Bearer ” (capital B, one space). Env interpolation only resolves at Cursor startup — restart after editing your shell profile." },
      { symptom: "Tool list is stale.", fix: "Cursor caches tools per server. Toggle the server off and on, or restart Cursor." },
    ],
  },
  {
    id: "claude",
    label: "Claude",
    support: "partial",
    supportNote:
      "Claude Code CLI works with --header today. claude.ai / Claude Desktop custom connectors support request headers only in beta and may fall back to an OAuth prompt.",
    verifiedAgainst:
      "claude.com/docs/connectors/custom/remote-mcp · support.claude.com custom connectors · anthropics/claude-ai-mcp#644",
    whereToGo: [
      "Claude Code (terminal): any shell where the claude CLI is installed.",
      "claude.ai / Claude Desktop: Customize → Connectors (Team/Enterprise: Organization settings → Connectors).",
    ],
    whatToClick: [
      "Claude Code: run the command below, then /mcp inside a session to confirm 15 tools.",
      "claude.ai: + → Add custom connector → paste the URL → Request headers → header name authorization → value “Bearer <token>” → Add.",
    ],
    whatToPaste: {
      language: "bash",
      body: `claude mcp add --transport http people-analytics {{ENDPOINT}} \\
  --header "Authorization: Bearer {{TOKEN}}"`,
    },
    tokenPlacement:
      "Claude Code: --header flag. claude.ai: the Request headers section of the Add custom connector dialog (beta). Enter “Bearer ” plus the token; Claude stores the value and does not show it again.",
    exampleQuestion: "Ask people-analytics for the certified Headcount as of 2026-08-31 and who owns the metric.",
    expectedResult: [
      ...SHARED_EXPECTED,
      "A second call to get_metric_definition returns owner, version and the business definition; nothing is rewritten by the model.",
    ],
    permissionNotes: [
      ...SHARED_PERMISSIONS,
      "Remote connectors are brokered from Anthropic's infrastructure, not your machine. Local claude_desktop_config.json entries are stdio-only and cannot carry this endpoint directly.",
    ],
    troubleshooting: [
      { symptom: "claude.ai redirects to an /authorize URL and fails with 401.", fix: "Known beta issue: the connector ignored the configured header and started OAuth. Use Claude Code with --header, or wait for the fix tracked in claude-ai-mcp#644." },
      { symptom: "“Bearer Bearer …” in logs.", fix: "Enter the header value once, with a single “Bearer ” prefix." },
      { symptom: "Free plan: cannot add a second connector.", fix: "Free accounts are limited to one custom connector. Remove another or use Claude Code." },
    ],
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    support: "unsupported",
    supportNote:
      "ChatGPT custom apps/connectors accept No authentication or OAuth. This endpoint requires a static Bearer header, so the ChatGPT app cannot connect directly. Developers can use the Responses API.",
    verifiedAgainst:
      "help.openai.com “Developer mode and MCP apps in ChatGPT” · developers.openai.com/api/docs/mcp",
    whereToGo: [
      "ChatGPT app: Settings → Apps → Advanced settings → Developer mode (paid plans; workspace admins may need to enable it).",
      "Developers: OpenAI Responses API with a tool of type mcp.",
    ],
    whatToClick: [
      "ChatGPT app: Apps → Create → paste the URL → Scan Tools. The scan fails for this endpoint because no header field is offered.",
      "Responses API: send the request below from your own code.",
    ],
    whatToPaste: {
      language: "json",
      body: `{
  "model": "<your model>",
  "input": "What is certified Headcount as of 2026-08-31?",
  "tools": [
    {
      "type": "mcp",
      "server_label": "people-analytics",
      "server_url": "{{ENDPOINT}}",
      "headers": { "Authorization": "Bearer {{TOKEN}}" },
      "require_approval": "never"
    }
  ]
}`,
    },
    tokenPlacement:
      "Responses API: tools[].headers.Authorization. There is no equivalent field in the ChatGPT app UI today.",
    exampleQuestion: "What is certified Headcount as of 2026-08-31?",
    expectedResult: [
      "Responses API: the mcp tool lists 15 tools, calls get_metric, and the model quotes 49,823 from the tool result.",
      "ChatGPT app: Scan Tools returns unauthorized. This is expected until ChatGPT supports static headers or this endpoint offers OAuth.",
    ],
    permissionNotes: SHARED_PERMISSIONS,
    troubleshooting: [
      { symptom: "“Scan Tools” finds nothing / unauthorized.", fix: "Not fixable from the ChatGPT side today. Use Cursor, Claude Code, or the Responses API." },
      { symptom: "Developer mode toggle is missing.", fix: "Requires a paid plan; Business/Enterprise admins enable it under Workspace Settings → Permissions & Roles." },
    ],
  },
  {
    id: "copilot",
    label: "Microsoft Copilot",
    support: "partial",
    supportNote:
      "End users cannot add an MCP server inside Microsoft 365 Copilot chat. A maker adds it as a Copilot Studio tool and publishes an agent. Not re-tested here.",
    verifiedAgainst:
      "learn.microsoft.com · Copilot Studio “Connect your agent to an existing MCP server” · “Setup and connect to MCP Server via Microsoft 365 Copilot”",
    whereToGo: [
      "Copilot Studio (maker licence) → your agent → Tools.",
    ],
    whatToClick: [
      "Add a tool → New tool → Model Context Protocol.",
      "Server name people-analytics · Server URL below · Authentication: API key.",
      "Create connection → Add to agent → Publish to Teams / Microsoft 365 Copilot.",
    ],
    whatToPaste: {
      language: "text",
      body: `Server URL:   {{ENDPOINT}}
Auth type:    API key
Header name:  Authorization
Header value: Bearer {{TOKEN}}`,
    },
    tokenPlacement:
      "API key authentication, header location, name Authorization, value “Bearer <token>”. The user of the agent supplies the key once through Connection Manager.",
    exampleQuestion: "What is certified Headcount as of 2026-08-31?",
    expectedResult: [
      ...SHARED_EXPECTED,
      "Generative orchestration must be on; Copilot Studio lists the 15 tools and refreshes them automatically.",
    ],
    permissionNotes: [
      ...SHARED_PERMISSIONS,
      "Copilot Studio adds its own tenant-level governance on top. This endpoint does not accept Entra tokens; it only checks the demo Bearer value.",
    ],
    troubleshooting: [
      { symptom: "Tool creation asks for OAuth endpoints.", fix: "Choose API key, not OAuth 2.0. This endpoint does not publish an authorization server." },
      { symptom: "End users see “Open Connection Manager”.", fix: "Expected on first use: they must submit the shared key once." },
      { symptom: "No maker licence.", fix: "There is no end-user path in Microsoft 365 Copilot chat today." },
    ],
  },
  {
    id: "other",
    label: "Other MCP clients",
    support: "supported",
    supportNote:
      "Any Streamable HTTP client that can send a static Authorization header. Examples: VS Code, MCP Inspector, mcp-remote bridge.",
    verifiedAgainst: "modelcontextprotocol.io Streamable HTTP transport · client docs as linked",
    whereToGo: [
      "VS Code: .vscode/mcp.json in a workspace.",
      "MCP Inspector: npx @modelcontextprotocol/inspector in a terminal.",
      "Stdio-only clients: bridge with npx mcp-remote <url> --header.",
    ],
    whatToClick: [
      "VS Code: Command Palette → MCP: Add Server → HTTP → paste URL, then add the headers block.",
      "Inspector: Transport Streamable HTTP → URL → Authentication → Bearer token → Connect → List Tools.",
    ],
    whatToPaste: {
      language: "json",
      body: `{
  "servers": {
    "people-analytics": {
      "type": "http",
      "url": "{{ENDPOINT}}",
      "headers": { "Authorization": "Bearer {{TOKEN}}" }
    }
  }
}`,
    },
    tokenPlacement:
      "Wherever the client exposes request headers. The endpoint is stateless JSON-RPC over POST; GET returns the text people-mcp and there is no SSE stream.",
    exampleQuestion: "Call list_metrics, then get_metric for headcount as of 2026-08-31.",
    expectedResult: [
      ...SHARED_EXPECTED,
      "list_metrics returns only the internal certified metrics the site visitor identity may read; confidential metrics are not listed, and get_metric on one of them returns value=null with reason sensitivity.",
    ],
    permissionNotes: SHARED_PERMISSIONS,
    troubleshooting: [
      { symptom: "Client insists on SSE.", fix: "Pick Streamable HTTP. Legacy HTTP+SSE clients cannot use this endpoint." },
      { symptom: "-32602 identity_id is not accepted.", fix: "Remove identity_id from the arguments. The token fixes the identity." },
      { symptom: "-32602 incident_replay is not in scope.", fix: "The public token only reads current_certified. The incident story is on /enterprise-demo/incident." },
    ],
  },
];

export function renderSnippet(body: string, endpoint: string, token: string): string {
  return body.replaceAll("{{ENDPOINT}}", endpoint).replaceAll("{{TOKEN}}", token || MCP_TOKEN_PLACEHOLDER);
}

export const SUPPORT_LABEL: Record<ClientSupport, string> = {
  verified: "Verified",
  supported: "Supported",
  partial: "Partial · see note",
  unsupported: "Not available today",
};
