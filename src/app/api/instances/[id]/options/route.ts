import { api, parseInput } from "../../../../../lib/server/http";
import { readRealtimeSnapshot } from "../../../../../lib/server/realtime-snapshots";
import { instanceParamsSchema } from "../../../../../lib/server/schemas";

export const runtime = "nodejs";

export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const { id } = parseInput(instanceParamsSchema, await context.params);
    return readRealtimeSnapshot(["instance-options", id]);
  }, request);
}
