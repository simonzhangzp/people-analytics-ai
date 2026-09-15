"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CONNECT_GUIDES,
  SUPPORT_LABEL,
  renderSnippet,
  type ClientSupport,
} from "@/lib/people/connect-guides";
import { cn } from "@/lib/utils";

const SUPPORT_TONE: Record<ClientSupport, string> = {
  verified: "border-certified-line bg-certified-soft text-certified-dark",
  supported: "border-primary-ring bg-primary-soft text-primary-deep",
  partial: "border-gold-line bg-gold-soft text-gold-dark",
  unsupported: "border-danger-line bg-danger-soft text-danger",
};

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
      <p className="flex items-baseline gap-2 text-[13px] font-semibold text-ink">
        <span className="text-[11px] tabular-nums text-faint">{n}</span>
        {title}
      </p>
      <div className="text-[13px] leading-6 text-body">{children}</div>
    </li>
  );
}

function Snippet({ body }: { body: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-[8px] border border-edge bg-white p-4 pr-24 text-[12px] leading-5 text-ink">
        {body}
      </pre>
      <button
        type="button"
        className="absolute right-3 top-3 inline-flex min-h-8 items-center rounded-[8px] border border-edge-strong bg-white px-3 text-[12px] font-semibold text-ink hover:border-edge-strong"
        onClick={async () => {
          await navigator.clipboard.writeText(body);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function ConnectGuide({ endpoint, token }: { endpoint: string; token: string }) {
  const [value, setValue] = useState(CONNECT_GUIDES[0].id);

  // Deep links like /connect#claude open the matching tab. Subscribing to hashchange keeps
  // this an external-system sync rather than a synchronous setState in the effect body.
  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash.replace("#", "");
      if (CONNECT_GUIDES.some((guide) => guide.id === hash)) setValue(hash);
    };
    window.addEventListener("hashchange", apply);
    const frame = window.requestAnimationFrame(apply);
    return () => {
      window.removeEventListener("hashchange", apply);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <Tabs value={value} onValueChange={setValue} className="mt-8" data-testid="connect-guide">
      <TabsList className="flex-wrap" aria-label="AI clients">
        {CONNECT_GUIDES.map((guide) => (
          <TabsTrigger key={guide.id} value={guide.id} data-testid={`connect-tab-${guide.id}`}>
            {guide.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {CONNECT_GUIDES.map((guide) => (
        <TabsContent key={guide.id} value={guide.id} className="surface p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{guide.label}</h2>
            <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", SUPPORT_TONE[guide.support])}>
              {SUPPORT_LABEL[guide.support]}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-[14px] leading-6 text-body-2">{guide.supportNote}</p>
          <p className="mt-1 text-[11px] text-faint">Verified against: {guide.verifiedAgainst}</p>

          <ol className="mt-8 flex flex-col gap-6">
            <Step n={1} title="Where to go">
              <ul className="space-y-1">
                {guide.whereToGo.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Step>
            <Step n={2} title="What to click">
              <ul className="space-y-1">
                {guide.whatToClick.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Step>
            <Step n={3} title="What to paste">
              {guide.whatToPaste ? (
                <Snippet body={renderSnippet(guide.whatToPaste.body, endpoint, token)} />
              ) : (
                <p>Nothing to paste for this client.</p>
              )}
            </Step>
            <Step n={4} title="Token / endpoint placement">{guide.tokenPlacement}</Step>
            <Step n={5} title="Example test question">
              <p className="rounded-[8px] border border-edge bg-canvas-2 px-3 py-2 font-medium text-ink">
                “{guide.exampleQuestion}”
              </p>
            </Step>
            <Step n={6} title="Expected result">
              <ul className="space-y-1">
                {guide.expectedResult.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Step>
            <Step n={7} title="Permission notes">
              <ul className="space-y-1">
                {guide.permissionNotes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Step>
            <Step n={8} title="Common errors">
              <dl className="space-y-2">
                {guide.troubleshooting.map((row) => (
                  <div key={row.symptom}>
                    <dt className="font-semibold text-ink">{row.symptom}</dt>
                    <dd className="text-body-2">{row.fix}</dd>
                  </div>
                ))}
              </dl>
            </Step>
          </ol>
        </TabsContent>
      ))}
    </Tabs>
  );
}
