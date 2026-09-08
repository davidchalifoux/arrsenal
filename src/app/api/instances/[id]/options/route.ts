import { instanceOptions } from "../../../../../lib/server/arr";
import { getInstance } from "../../../../../lib/server/config";
import { api, parseInput } from "../../../../../lib/server/http";
import { instanceParamsSchema } from "../../../../../lib/server/schemas";

export const runtime = "nodejs";

export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const { id } = parseInput(instanceParamsSchema, await context.params);
    return instanceOptions(await getInstance(id));
  }, request);
}
