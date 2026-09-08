import { api, jsonBody } from "../../../lib/server/http";
import { addMedia, removeMedia } from "../../../lib/server/services";

export const runtime = "nodejs";

export function POST(request: Request) {
  return api(async () => addMedia(await jsonBody(request)), request);
}

export function DELETE(request: Request) {
  return api(async () => removeMedia(await jsonBody(request)), request);
}
