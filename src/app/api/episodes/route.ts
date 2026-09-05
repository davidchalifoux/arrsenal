import { episodes } from "../../../lib/server/episodes";
import { api, parseInput } from "../../../lib/server/http";
import { episodesQuerySchema } from "../../../lib/server/schemas";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(async () => {
    const query = new URL(request.url).searchParams;
    const { instanceId, remoteId } = parseInput(episodesQuerySchema, {
      instanceId: query.get("instanceId"),
      remoteId: query.get("remoteId"),
    });
    return episodes(instanceId, remoteId);
  });
}
