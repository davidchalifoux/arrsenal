import { calendar } from "../../../lib/server/calendar";
import { api } from "../../../lib/server/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(async () => {
    const params = new URL(request.url).searchParams;
    const result = await calendar(params.get("start"), params.get("end"));
    const failed =
      result.instanceCount > 0 && result.errors.length === result.instanceCount;
    return Response.json(
      {
        ...result,
        ...(failed
          ? {
              error:
                "Calendar unavailable: all configured instances failed. " +
                result.errors
                  .map((error) => `${error.instanceName}: ${error.message}`)
                  .join(" "),
            }
          : {}),
      },
      {
        status: failed ? 502 : 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  });
}
