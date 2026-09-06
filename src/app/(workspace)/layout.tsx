import type { ReactNode } from "react";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceLoading>
      <WorkspaceProvider>
        <WorkspaceShell>{children}</WorkspaceShell>
      </WorkspaceProvider>
    </WorkspaceLoading>
  );
}
