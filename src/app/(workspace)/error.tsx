"use client";

import { useEffect } from "react";
import { useDismissWorkspaceLoading } from "@/components/workspace-loading";
import ErrorPage from "../error";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  const dismiss = useDismissWorkspaceLoading();
  useEffect(() => dismiss?.(), [dismiss]);
  return <ErrorPage reset={reset} />;
}
