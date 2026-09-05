import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { datasetFreshnessCopy, PEOPLE_DATASET_PAGE_COPY as COPY } from "@/lib/people/dataset-page-copy";
import { loadHealthcheckStatus } from "@/lib/people/healthcheck";
import { pageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = pageMetadata({
  title: "Dataset",
  description:
    "Synthetic GlobalTech workforce dataset behind People Analytics AI, frozen at data-v1 as-of 2026-08-31.",
  path: "/dataset",
});

export default async function DatasetPage() {
  const health = await loadHealthcheckStatus();
  const freshness = datasetFreshnessCopy(health);

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <SiteHeader active="/dataset" />
      <main className="mx-auto max-w-[1100px] space-y-8 px-5 py-12 sm:px-8">
        <p className="eyebrow">{COPY.eyebrow}</p>
        <h1 className="mt-4 max-w-3xl text-[36px] font-bold leading-[1.1] tracking-[-0.04em] text-[#13203a]">
          {COPY.title}
        </h1>
        <p className="mt-5 max-w-3xl text-[16px] leading-7 text-[#536177]">{COPY.lead}</p>
        <p className="text-[13px] font-medium text-[#3657af]">{COPY.privacy}</p>

        <section className="surface p-6">
          <p className="eyebrow">Active scenarios</p>
          <ol className="mt-4 space-y-3 text-[14px] leading-6 text-[#546277]">
            {COPY.scenarios.map((row) => (
              <li key={row.id}>
                <span className="font-semibold text-[#1c2b44]">{row.id}</span> — {row.body}
              </li>
            ))}
          </ol>
        </section>

        <section className="surface p-6">
          <p className="eyebrow">SYNTHETIC_EXTENSION</p>
          <p className="mt-3 text-[14px] leading-6 text-[#546277]">{COPY.synthetic}</p>
        </section>

        <section className="surface p-6">
          <p className="eyebrow">External sources</p>
          <p className="mt-3 text-[14px] leading-6 text-[#546277]">{COPY.external}</p>
        </section>

        <section className="surface p-6">
          <p className="eyebrow">FRESHNESS</p>
          <p className="mt-3 text-[14px] leading-6 text-[#546277]" data-testid="dataset-freshness">
            {freshness}
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
