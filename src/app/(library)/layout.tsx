import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LibraryLoading } from "@/components/library-loading";
import { LibraryProvider } from "@/components/library-provider";
import { LibraryShell } from "@/components/library-shell";
import { authorize } from "@/lib/server/auth";

export default async function LibraryRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!(await authorize((await headers()).get("cookie")))) redirect("/login");
  return (
    <LibraryLoading>
      <LibraryProvider>
        <LibraryShell>{children}</LibraryShell>
      </LibraryProvider>
    </LibraryLoading>
  );
}
