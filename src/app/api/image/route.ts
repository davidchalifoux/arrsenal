import { arrRequest, imageResponse } from "../../../lib/server/arr";
import { getInstance } from "../../../lib/server/config";
import { ApiError, parseInput, publicApi } from "../../../lib/server/http";
import { coverPath } from "../../../lib/server/media";
import { imageQuerySchema } from "../../../lib/server/schemas";

export const runtime = "nodejs";

export function GET(request: Request) {
  return publicApi(async () => {
    const query = new URL(request.url).searchParams;
    const { instanceId, path, fallback } = parseInput(imageQuerySchema, {
      instanceId: query.get("instanceId"),
      path: query.get("path"),
      fallback: query.get("fallback") ?? undefined,
    });
    const instance = await getInstance(instanceId);
    const cover = coverPath(instance, path);
    try {
      return await arrRequest(instance, cover, { image: true });
    } catch (error) {
      if (!fallback) throw error;
    }
    try {
      // CDN requests are separate from arrRequest so instance credentials never leave the instance.
      const response = await fetch(fallback, {
        headers: { Accept: "image/*" },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      return await imageResponse(response);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, "Unable to load fallback artwork.");
    }
  });
}
