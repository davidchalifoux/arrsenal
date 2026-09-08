import { api } from "../../../lib/server/http";
import { readRealtimeSnapshot } from "../../../lib/server/realtime-snapshots";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(() => readRealtimeSnapshot(["library"]), request);
}
