import { api, mutationGuard } from "@/lib/server/http";
import { checkForUpdates, getUpdateStatus } from "@/lib/server/releases";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(getUpdateStatus, request);
}

export function POST(request: Request) {
  return api(async () => {
    mutationGuard(request);
    return checkForUpdates();
  }, request);
}
