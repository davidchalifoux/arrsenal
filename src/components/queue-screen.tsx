"use client";

import { css } from "@styled-system/css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queueQuery } from "@/lib/queries";
import { DownloadQueue } from "./queue";
import { Notice } from "./ui";
import { useWorkspace } from "./workspace-provider";

export function QueueScreen() {
  const client = useQueryClient();
  const queue = useQuery(queueQuery);
  const { notify } = useWorkspace();
  return (
    <>
      {queue.isError && (
        <div className={css({ mb: "16px" })}>
          <Notice error>{queue.error.message}</Notice>
        </div>
      )}
      <DownloadQueue
        data={queue.data}
        loading={queue.isPending || queue.isFetching}
        onRefresh={() => {
          void client.invalidateQueries({ queryKey: ["queue"] });
        }}
        notify={notify}
      />
    </>
  );
}
