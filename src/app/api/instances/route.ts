import { instanceSummary, testConnection } from "../../../lib/server/arr";
import {
  instanceInput,
  readInstances,
  saveInstance,
} from "../../../lib/server/config";
import { api, jsonBody } from "../../../lib/server/http";

export const runtime = "nodejs";

export function GET() {
  return api(async () => ({
    instances: await Promise.all((await readInstances()).map(instanceSummary)),
  }));
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
  });
}
