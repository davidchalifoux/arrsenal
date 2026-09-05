"use client";

import { css } from "@styled-system/css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { instancesQuery } from "@/lib/queries";
import { PageHeader } from "./page-header";
import { Settings } from "./settings";
import { Notice, Spinner } from "./ui";
import { useWorkspace } from "./workspace-provider";

export function SettingsScreen({ autoOpen = false }: { autoOpen?: boolean }) {
  const instances = useQuery(instancesQuery);
  const client = useQueryClient();
  const { notify } = useWorkspace();
  const router = useRouter();
  if (instances.isPending)
    return (
      <section>
        <PageHeader title="Connections" />
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "muted",
          })}
        >
          <Spinner />
          Loading connections...
        </div>
      </section>
    );
  return (
    <>
      {instances.isError && (
        <div className={css({ mb: "16px" })}>
          <Notice error>{instances.error.message}</Notice>
        </div>
      )}
      <Settings
        instances={instances.data?.instances ?? []}
        onChanged={() => {
          void client.invalidateQueries();
        }}
        notify={notify}
        autoOpen={autoOpen}
        onAutoOpened={() => router.replace("/settings", { scroll: false })}
      />
    </>
  );
}
