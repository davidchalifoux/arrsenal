import type { ReactNode } from "react";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </WorkspaceProvider>
  );
}
