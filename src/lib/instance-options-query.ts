import { queryOptions } from "@tanstack/react-query";
import { realtimeQuery } from "./realtime-query";
import type { InstanceOptions } from "./types";

export function instanceOptionsQuery(instanceId: string) {
  return queryOptions({
    queryKey: ["instance-options", instanceId],
    staleTime: 5 * 60_000,
    queryFn: (context) =>
      realtimeQuery<InstanceOptions>(
        context,
        `/api/instances/${encodeURIComponent(instanceId)}/options`,
      ),
  });
}
