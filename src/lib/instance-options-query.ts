import { queryOptions } from "@tanstack/react-query";
import { api } from "./client";
import type { InstanceOptions } from "./types";

export function instanceOptionsQuery(instanceId: string) {
  return queryOptions({
    queryKey: ["instance-options", instanceId],
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      api<InstanceOptions>(
        `/api/instances/${encodeURIComponent(instanceId)}/options`,
        { signal },
      ),
  });
}
