import { ApiError, publicApi } from "../../../../../lib/server/http";
import { takeFile } from "../../../../../lib/server/release-file-store";

export const runtime = "nodejs";

// Public on purpose: Sonarr and Radarr have no Arrsenal session. The random
// one-time token is the only credential, and it expires after a download.
export function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  return publicApi(async () => {
    const { token } = await context.params;
    const file = /^[\w-]{43}$/.test(token) ? takeFile(token) : undefined;
    if (!file) throw new ApiError(404, "File not found or already downloaded.");
    return new Response(file.bytes, {
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
