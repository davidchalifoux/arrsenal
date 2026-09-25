"use client";

import { useEffect } from "react";
import { useDismissLibraryLoading } from "@/components/library-loading";
import { Page } from "@/components/page-header";
import ErrorPage from "../error";

export default function LibraryError({ reset }: { reset: () => void }) {
  const dismiss = useDismissLibraryLoading();
  useEffect(() => dismiss?.(), [dismiss]);
  return (
    <Page>
      <ErrorPage reset={reset} />
    </Page>
  );
}
