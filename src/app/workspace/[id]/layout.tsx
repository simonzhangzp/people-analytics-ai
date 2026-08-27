import { DemoProvider } from "@/components/demo-provider";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DemoProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </DemoProvider>
  );
}
