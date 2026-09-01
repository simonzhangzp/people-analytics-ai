import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";

export const metadata = {
  title: "About",
  description: "Simon Zhang — People Analytics, data foundation, and AI-ready workforce intelligence.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <SiteHeader active="/about" />
      <main className="mx-auto max-w-[800px] px-5 py-12 sm:px-8">
        <p className="eyebrow">About / Resume</p>
        <h1 className="mt-4 text-[32px] font-bold tracking-[-0.04em] text-[#13203a]">
          Simon Zhang
        </h1>
        <p className="mt-5 text-[16px] leading-7 text-[#546277]">
          I build People Analytics systems where HR domain knowledge, data science,
          and enterprise data governance sit in front of AI — not the other way around.
        </p>
        <ul className="mt-6 space-y-3 text-[15px] leading-7 text-[#3e4c61]">
          <li>HR domain: workforce decisions, metric meaning, operating context.</li>
          <li>Data science / ML: segmentation, risk and planning on governed grains.</li>
          <li>Data foundation: lake, quality tests, metric registry, lineage, serving RPCs.</li>
          <li>People AI: bounded tools over certified metrics, never unconstrained SQL.</li>
        </ul>
        <p className="mt-8 text-[15px] leading-7 text-[#546277]">
          The public site is a recruiter portfolio over a working synthetic enterprise
          dataset (GlobalTech). Start with the{" "}
          <Link href="/enterprise-demo" className="font-semibold text-[#3157c9]">
            Enterprise Demo
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
