"use client";

import { useState } from "react";

export function CopyToken({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  if (!token) return null;
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      <code
        className="block flex-1 overflow-x-auto rounded-[6px] border border-[#d6dce5] bg-white px-3 py-2 text-[13px] text-[#24324b]"
        data-testid="mcp-demo-token"
      >
        {token}
      </code>
      <button
        type="button"
        className="inline-flex min-h-10 items-center justify-center rounded-[6px] bg-[#3157c9] px-4 text-[13px] font-semibold text-white"
        onClick={async () => {
          await navigator.clipboard.writeText(token);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? "Copied" : "Copy token"}
      </button>
    </div>
  );
}
