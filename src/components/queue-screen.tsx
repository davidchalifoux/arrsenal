"use client";

import { css } from "@styled-system/css";
import { useQueue, useSyncData } from "@/lib/collections";
import { DownloadQueue } from "./queue";
import { Notice } from "./ui";
import { useWorkspace } from "./workspace-provider";

export function QueueScreen() {
  const sync = useSyncData();
  const queue = useQueue(true);
  const { notify } = useWorkspace();
  return (
    <>
      {queue.isError && (
        <div className={css({ mb: "16px" })}>
          <Notice error>
            {queue.error.message}
            {queue.data && " Showing the last loaded queue."}
          </Notice>
        </div>
      )}
      <DownloadQueue
        data={queue.data}
        loading={queue.isPending || queue.isFetching}
        onRefresh={() => {
          void sync("queue");
        }}
        notify={notify}
      />
    </>
  );
}
