import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";

export const metadata = {
  title: "Lab",
  robots: { index: false, follow: false },
  description: "Earlier file-based People analytics experiments. Not the enterprise demo.",
};

const ITEMS = [
  ["/workbench", "Browser workbench", "Local DuckDB fallback for uploaded People files."],
  ["/ask", "Ask a file", "Redirects into the workbench ask path."],
  ["/demo", "Synthetic attrition files", "Three related demo workbooks."],
  ["/strategy", "Measurement strategy experiment", "Strategy → metrics → data workflow."],
];

export default function LabPage() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <SiteHeader />
      <main className="mx-auto max-w-[800px] px-5 py-12 sm:px-8">
        <p className="eyebrow">Experiments / Lab</p>
        <h1 className="mt-4 text-[32px] font-bold tracking-[-0.04em] text-[#13203a]">
          Earlier file-based AI analytics
        </h1>
        <p className="mt-4 text-[15px] leading-7 text-[#546277]">
          These routes are preserved explorations of upload-and-ask People analytics.
          They are not the Enterprise People Data & AI platform. The recruiter path is
          the three case studies.
        </p>
        <ul className="mt-8 space-y-3">
          {ITEMS.map(([href, title, copy]) => (
            <li key={href} className="surface p-4">
              <Link href={href} className="text-[15px] font-semibold text-[#3157c9]">
                {title}
              </Link>
              <p className="mt-1 text-[13px] text-[#546277]">{copy}</p>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
