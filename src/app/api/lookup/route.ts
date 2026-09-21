import { searchCatalog } from "../../../lib/server/catalog";
import { api, parseInput } from "../../../lib/server/http";
import { lookupQuerySchema } from "../../../lib/server/schemas";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(async () => {
    const query = new URL(request.url).searchParams;
    const { term, kind } = parseInput(lookupQuerySchema, {
      term: query.get("term") ?? undefined,
      kind: query.get("kind") ?? undefined,
    });
    return searchCatalog(term, kind, request.signal);
  }, request);
}
