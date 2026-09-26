"use client";

import { css } from "@styled-system/css";
import { useQueue, useSyncData } from "@/lib/client-data";
import { useLibraryActions } from "./library-provider";
import { DownloadQueue } from "./queue";
import { Notice } from "./ui";

export function QueueScreen() {
  const sync = useSyncData();
  const queue = useQueue();
  const { notify } = useLibraryActions();
  return (
    <DownloadQueue
      data={queue.data}
      loading={queue.isPending || queue.isFetching}
      onRefresh={() => {
        void sync("queue");
      }}
      notify={notify}
      notice={
        queue.isError && (
          <div className={css({ mb: "16px" })}>
            <Notice error>
              {queue.error.message}
              {queue.data && " Showing the last loaded queue."}
            </Notice>
          </div>
        )
      }
    />
  );
}
