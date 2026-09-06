import { testConnection } from "../../../../lib/server/arr";
import {
  getInstance,
  removeInstance,
  updateInstance,
} from "../../../../lib/server/config";
import {
  api,
  jsonBody,
  mutationGuard,
  parseInput,
} from "../../../../lib/server/http";
import {
  instanceEditSchema,
  instanceParamsSchema,
} from "../../../../lib/server/schemas";

export const runtime = "nodejs";

export function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const body = parseInput(instanceEditSchema, await jsonBody(request));
    const { id } = parseInput(instanceParamsSchema, await context.params);
    const current = await getInstance(id);
    const input = { ...body, apiKey: body.apiKey ?? current.apiKey };
    const version = await testConnection(input);
    const saved = await updateInstance(current, input);
    return {
      instance: {
        id: saved.id,
        name: saved.name,
        kind: saved.kind,
        url: saved.url,
        hasApiKey: true,
        connected: true,
        version,
      },
    };
  });
}

export function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    mutationGuard(request, false);
    if (request.body !== null) await jsonBody(request);
    const { id } = parseInput(instanceParamsSchema, await context.params);
    await removeInstance(id);
    return {
      success: true,
      message: "Instance disconnected. No remote media or files were deleted.",
    };
  });
}
