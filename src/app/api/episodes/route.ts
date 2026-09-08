import { api, jsonBody, parseInput } from "../../../lib/server/http";
import { readRealtimeSnapshot } from "../../../lib/server/realtime-snapshots";
import { episodesQuerySchema } from "../../../lib/server/schemas";
import { removeEpisodeFiles } from "../../../lib/server/services";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(async () => {
    const query = new URL(request.url).searchParams;
    const { instanceId, remoteId } = parseInput(episodesQuerySchema, {
      instanceId: query.get("instanceId"),
      remoteId: query.get("remoteId"),
    });
    return readRealtimeSnapshot(["episodes", instanceId, remoteId]);
  }, request);
}

export function DELETE(request: Request) {
  return api(async () => removeEpisodeFiles(await jsonBody(request)), request);
}
