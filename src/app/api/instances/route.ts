import { testConnection } from "../../../lib/server/arr";
import { instanceInput, saveInstance } from "../../../lib/server/config";
import { api, jsonBody } from "../../../lib/server/http";
import { readRealtimeSnapshot } from "../../../lib/server/realtime-snapshots";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(() => readRealtimeSnapshot(["instances"]), request);
}

export function POST(request: Request) {
  return api(async () => {
    const input = instanceInput(await jsonBody(request));
    const version = await testConnection(input);
    const saved = await saveInstance(input);
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
  }, request);
}
