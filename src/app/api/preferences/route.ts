import { readPreferences, savePreferences } from "@/lib/server/config";
import { api, jsonBody } from "@/lib/server/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(readPreferences, request);
}

export function PATCH(request: Request) {
  return api(async () => savePreferences(await jsonBody(request)), request);
}
