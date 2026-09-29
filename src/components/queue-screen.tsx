"use client";

import { css } from "@styled-system/css";
import { useQueue, useSyncData } from "@/lib/client-data";
import { useLibraryActions } from "./library-provider";
import { DownloadQueue, queueColumns } from "./queue";
import { useTableColumns } from "./table-options";
import { Notice } from "./ui";

export function QueueScreen() {
  const sync = useSyncData();
  const queue = useQueue();
  const { notify } = useLibraryActions();
  const tableColumns = useTableColumns("queue", queueColumns);
  return (
    <DownloadQueue
      tableColumns={tableColumns}
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
