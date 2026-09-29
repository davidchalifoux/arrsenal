import { addressedOrigin, api, jsonBody } from "../../../../lib/server/http";
import { pushRelease } from "../../../../lib/server/services";

export const runtime = "nodejs";

// Room for a base64-encoded NZB file (up to 10 MB), and time to upload it.
const bodyLimits = { maxBytes: 15 * 1024 * 1024, timeoutMs: 60000 };

export function POST(request: Request) {
  return api(
    async () =>
      pushRelease(
        await jsonBody(request, bodyLimits),
        addressedOrigin(request),
      ),
    request,
  );
}
