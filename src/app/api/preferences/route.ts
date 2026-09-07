import { readPreferences, savePreferences } from "@/lib/server/config";
import { api, jsonBody } from "@/lib/server/http";

export const runtime = "nodejs";

export function GET() {
  return api(readPreferences);
}

export function PATCH(request: Request) {
  return api(async () => savePreferences(await jsonBody(request)));
}
