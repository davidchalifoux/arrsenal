import { removeInstance } from "../../../../lib/server/config";
import {
  api,
  jsonBody,
  mutationGuard,
  parseInput,
} from "../../../../lib/server/http";
import { instanceParamsSchema } from "../../../../lib/server/schemas";

export const runtime = "nodejs";

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
