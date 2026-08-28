import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { WorkbenchApp } from "@/components/workbench/WorkbenchApp";

export const metadata: Metadata = {
  title: "People Analytics Workbench",
  description:
    "Understand local People data, agree on metric meaning, explore evidence, and build an executive story.",
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

