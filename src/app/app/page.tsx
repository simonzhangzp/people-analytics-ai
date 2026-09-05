import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { BrandMark, PrimaryLink, SecondaryLink } from "@/components/ui";
import { formulatorPublicUrl } from "@/lib/formulator";

export const metadata: Metadata = {
  title: "Analyze People Data",
  description:
    "Open the Formulator analysis workspace. Uploaded People files are stored on that server.",
};

export default function FormulatorEntryPage() {
  const origin = formulatorPublicUrl();
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <header className="border-b border-[#e3e7ed] bg-white">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center px-5 sm:px-8">
          <Link href="/" aria-label="People Analytics AI Workbench home">
            <BrandMark />
          </Link>
          <div className="ml-auto">
            <SecondaryLink href="/">Home</SecondaryLink>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[720px] px-5 py-16 sm:px-8">
        <p className="eyebrow">Analyze · Formulator workspace</p>
        <h1 className="mt-4 text-[32px] font-semibold tracking-[-0.04em] text-[#14213b]">
          People files are analyzed on a dedicated server
        </h1>
        <div className="mt-5 flex items-start gap-2 rounded-[8px] border border-[#d9e4dd] bg-[#f6faf7] px-4 py-3 text-[12px] leading-5 text-[#4d6959]">
          <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Uploaded Excel and CSV files are stored in the Formulator workspace
          volume. They are not saved on the marketing site. Treat this as an
          analysis server, not a browser-only sandbox.
        </div>
        {origin ? (
          <div className="mt-8 space-y-3">
            <PrimaryLink href={origin} className="w-full sm:w-auto" testId="open-formulator">
              Open the analysis workspace
            </PrimaryLink>
            <p className="text-[12px] text-[#667287]">
              This opens Data Formulator with the People Analytics knowledge
              layer. The local browser workbench remains at{" "}
              <Link href="/workbench" className="font-semibold text-[#3156bc]">
                /workbench
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <p className="text-[14px] leading-6 text-[#536177]">
              The Formulator server is not configured in this environment. On a
              machine with Docker:
            </p>
            <pre className="overflow-x-auto rounded-[8px] border border-[#e3e7ed] bg-white px-4 py-3 text-[12px] text-[#334158]">
{`copy apps/formulator/.env.example apps/formulator/.env
docker compose -f apps/formulator/docker-compose.yml up --build`}
            </pre>
            <p className="text-[13px] text-[#536177]">
              Then set{" "}
              <code className="rounded bg-[#eef2fb] px-1">NEXT_PUBLIC_FORMULATOR_URL</code>{" "}
              to <code className="rounded bg-[#eef2fb] px-1">http://localhost:5567</code>
              , or to <code className="rounded bg-[#eef2fb] px-1">https://app.peopleanalyticsai.net</code>{" "}
              in production.
            </p>
            <PrimaryLink href="/workbench" testId="formulator-local-fallback">
              Continue in the browser-local workbench
            </PrimaryLink>
          </div>
        )}
      </main>
    </div>
  );
}
