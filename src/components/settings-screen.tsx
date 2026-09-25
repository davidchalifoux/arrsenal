"use client";

import { css } from "@styled-system/css";
import { useRouter } from "next/navigation";
import { useInstances, useSyncData } from "@/lib/client-data";
import { useLibraryActions } from "./library-provider";
import { PageHeader } from "./page-header";
import { Settings } from "./settings";
import { Notice, Spinner } from "./ui";

export function SettingsScreen({ autoOpen = false }: { autoOpen?: boolean }) {
  const instances = useInstances();
  const sync = useSyncData();
  const { notify } = useLibraryActions();
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
    <Settings
      notice={
        instances.isError && (
          <div className={css({ mb: "16px" })}>
            <Notice error>{instances.error.message}</Notice>
          </div>
        )
      }
      instances={instances.data?.instances ?? []}
      onRefresh={() => {
        void sync("all");
      }}
      notify={notify}
      autoOpen={autoOpen}
      onAutoOpened={() =>
        router.replace("/settings/connections", { scroll: false })
      }
    />
  );
}
