import type { ReactNode } from "react";
import { LibraryLoading } from "@/components/library-loading";
import { LibraryProvider } from "@/components/library-provider";
import { LibraryShell } from "@/components/library-shell";

export default function LibraryRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <LibraryLoading>
      <LibraryProvider>
        <LibraryShell>{children}</LibraryShell>
      </LibraryProvider>
    </LibraryLoading>
  );
}
