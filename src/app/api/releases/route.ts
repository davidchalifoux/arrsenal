import { api, jsonBody, parseInput } from "../../../lib/server/http";
import { releasesQuerySchema } from "../../../lib/server/schemas";
import { grabRelease, releases } from "../../../lib/server/services";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(async () => {
    const query = new URL(request.url).searchParams;
    const { instanceId, remoteId, kind, episodeId } = parseInput(
      releasesQuerySchema,
      {
        instanceId: query.get("instanceId"),
        remoteId: query.get("remoteId"),
        kind: query.get("kind"),
        episodeId: query.get("episodeId") ?? undefined,
      },
    );
    return releases(instanceId, remoteId, kind, episodeId);
  });
}

export function POST(request: Request) {
  return api(async () => grabRelease(await jsonBody(request)));
}
