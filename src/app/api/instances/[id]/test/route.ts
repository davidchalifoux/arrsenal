import { testConnection } from "../../../../../lib/server/arr";
import { getInstance } from "../../../../../lib/server/config";
import { api, jsonBody, parseInput } from "../../../../../lib/server/http";
import {
  instanceEditSchema,
  instanceParamsSchema,
} from "../../../../../lib/server/schemas";

export const runtime = "nodejs";

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const body = parseInput(instanceEditSchema, await jsonBody(request));
    const { id } = parseInput(instanceParamsSchema, await context.params);
    const current = await getInstance(id);
    const version = await testConnection({
      ...body,
      apiKey: body.apiKey ?? current.apiKey,
    });
    return {
      success: true,
      version,
      message: "Connection successful. The instance has not been saved.",
    };
  }, request);
}
