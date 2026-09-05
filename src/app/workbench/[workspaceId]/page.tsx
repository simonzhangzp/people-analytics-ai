import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { WorkbenchApp } from "@/components/workbench/WorkbenchApp";

export const metadata: Metadata = {
  title: "Analyze People Data",
  description:
    "Upload local People data, ask a question, and get a reproducible chart and answer in one Data Thread.",
};

export default async function WorkbenchPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  if (workspaceId === "new") {
    redirect(`/workbench/${randomUUID()}`);
  }
  return <WorkbenchApp workspaceId={workspaceId} />;
}

