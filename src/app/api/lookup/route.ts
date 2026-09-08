import { api, parseInput } from "../../../lib/server/http";
import { lookupQuerySchema } from "../../../lib/server/schemas";
import { lookup } from "../../../lib/server/services";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(async () => {
    const query = new URL(request.url).searchParams;
    const { term, kind } = parseInput(lookupQuerySchema, {
      term: query.get("term") ?? undefined,
      kind: query.get("kind") ?? undefined,
    });
    return lookup(term, kind);
  }, request);
}
