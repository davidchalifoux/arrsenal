import { api, jsonBody } from "../../../lib/server/http";
import { addMedia } from "../../../lib/server/services";

export const runtime = "nodejs";

export function POST(request: Request) {
  return api(async () => addMedia(await jsonBody(request)));
}
