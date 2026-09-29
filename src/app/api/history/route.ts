import { markHistoryFailed, readHistory } from "../../../lib/server/activity";
import { api, jsonBody, parseInput } from "../../../lib/server/http";
import { historyQuerySchema } from "../../../lib/server/schemas";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(async () => {
    const query = new URL(request.url).searchParams;
    const { limit, event } = parseInput(historyQuerySchema, {
      limit: query.get("limit") ?? undefined,
      event: query.get("event") ?? undefined,
    });
    return readHistory(limit, event);
  }, request);
}

/** Marks a grabbed release as failed. */
export function POST(request: Request) {
  return api(async () => markHistoryFailed(await jsonBody(request)), request);
}
