import { getLatestRelease } from "@/lib/latest-release";

// Arrsenal installs check this file for updates, so its address and shape are
// permanent. It's generated at build time; the release workflow redeploys the
// site once each release image is published.
export const dynamic = "force-static";

export async function GET() {
  return Response.json(await getLatestRelease());
}
