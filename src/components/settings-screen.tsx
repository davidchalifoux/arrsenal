"use client";

import { css } from "@styled-system/css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { instancesQuery } from "@/lib/queries";
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
        <h1
          className={css({
            fontSize: "25px",
            fontWeight: "600",
            letterSpacing: "-.7px",
            mb: "18px",
          })}
        >
          Connections
        </h1>
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
