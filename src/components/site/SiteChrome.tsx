"use client";

import Link from "next/link";
import { BrandMark } from "@/components/ui";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/enterprise-demo", label: "Enterprise Demo" },
  { href: "/architecture", label: "Architecture" },
  { href: "/try", label: "Try It Yourself" },
  { href: "/perspective", label: "Perspective" },
  { href: "/about", label: "About" },
];

export function SiteHeader({ active }: { active?: string } = {}) {
  return (
    <header className="sticky top-0 z-40 border-b border-edge/80 bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-16 max-w-[1100px] items-center gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="PeopleAnalyticsAI home">
          <BrandMark />
        </Link>
        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Primary" data-testid="primary-nav">
          {NAV.map((item) => {
            const isActive = active === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative rounded-[8px] px-3 py-2 text-[13px] font-semibold transition-colors",
                  isActive ? "text-ink" : "text-body-2 hover:bg-canvas-2 hover:text-ink",
                )}
              >
                {item.label}
                {isActive ? (
                  <span aria-hidden="true" className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-primary" />
                ) : null}
              </Link>
            );
          })}
          <Link
            href="/connect"
            className="ml-3 inline-flex min-h-9 items-center rounded-[8px] bg-ink px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-ink-3"
          >
            Connect via MCP
          </Link>
        </nav>
      </div>
      <nav className="flex gap-4 overflow-x-auto border-t border-edge px-5 py-2 md:hidden" aria-label="Primary">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "whitespace-nowrap text-[12px] font-semibold",
              active === item.href ? "text-primary" : "text-body-2",
            )}
          >
            {item.label}
          </Link>
        ))}
        <Link href="/connect" className="whitespace-nowrap text-[12px] font-semibold text-body-2">
          Connect
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="band-ink-deep border-t border-white/10">
      <div className="mx-auto max-w-[1100px] px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <p className="display text-[20px] font-bold tracking-[-0.02em] text-white">PeopleAnalyticsAI</p>
            <p className="mt-2 text-[13px] leading-6 text-on-ink-3">
              A working AI-ready People Analytics environment. Synthetic GlobalTech dataset, 49,823
              people, not a real company. Every number on this site comes from a governed serving RPC.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-[13px] sm:grid-cols-3">
            {[
              ["/enterprise-demo", "Enterprise Demo"],
              ["/architecture", "Architecture"],
              ["/try", "Try It Yourself"],
              ["/connect", "Connect via MCP"],
              ["/dataset", "Dataset"],
              ["/perspective", "Perspective"],
              ["/about", "About"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="text-on-ink-2 transition-colors hover:text-white">
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-[12px] text-on-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>Synthetic enterprise dataset. Aggregate only. Frozen data-v1 snapshot.</p>
          <p>Facts from SQL and policy. Hypotheses from the model, labelled as such.</p>
        </div>
      </div>
    </footer>
  );
}
