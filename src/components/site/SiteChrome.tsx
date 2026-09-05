"use client";

import Link from "next/link";
import { BrandMark } from "@/components/ui";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/enterprise-demo", label: "Enterprise Demo" },
  { href: "/architecture", label: "Architecture" },
  { href: "/perspective", label: "Perspective" },
  { href: "/about", label: "About" },
];

export function SiteHeader({ active }: { active?: string } = {}) {
  return (
    <header className="border-b border-[#e3e7ed] bg-white">
      <div className="mx-auto flex h-16 max-w-[1100px] items-center gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="PeopleAnalyticsAI home">
          <BrandMark />
        </Link>
        <nav className="ml-auto hidden items-center gap-5 md:flex" aria-label="Primary" data-testid="primary-nav">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-[13px] font-semibold ${
                active === item.href ? "text-[#23449f]" : "text-[#546277] hover:text-[#2f4fa9]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <nav className="flex gap-4 overflow-x-auto border-t border-[#eef0f4] px-5 py-2 md:hidden" aria-label="Primary">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap text-[12px] font-semibold ${
              active === item.href ? "text-[#23449f]" : "text-[#546277]"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[#e3e7ed] bg-[#f8f9fb]">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-5 py-8 text-[12px] text-[#667085] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>PeopleAnalyticsAI · Synthetic Enterprise Dataset · not a real company</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/enterprise-demo" className="hover:text-[#2f4fa9]">
            Enterprise Demo
          </Link>
          <Link href="/architecture" className="hover:text-[#2f4fa9]">
            Architecture
          </Link>
          <Link href="/connect" className="hover:text-[#2f4fa9]">
            Connect via MCP
          </Link>
          <Link href="/dataset" className="hover:text-[#2f4fa9]">
            Dataset
          </Link>
          <Link href="/lab" className="hover:text-[#2f4fa9]">
            Lab
          </Link>
        </div>
      </div>
    </footer>
  );
}
