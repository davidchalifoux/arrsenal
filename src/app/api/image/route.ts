import { arrRequest } from "../../../lib/server/arr";
import { getInstance } from "../../../lib/server/config";
import { api, parseInput } from "../../../lib/server/http";
import { coverPath } from "../../../lib/server/media";
import { imageQuerySchema } from "../../../lib/server/schemas";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(async () => {
    const query = new URL(request.url).searchParams;
    const { instanceId, path } = parseInput(imageQuerySchema, {
      instanceId: query.get("instanceId"),
      path: query.get("path"),
    });
    const instance = await getInstance(instanceId);
    return arrRequest(instance, coverPath(instance, path), { image: true });
  });
}
