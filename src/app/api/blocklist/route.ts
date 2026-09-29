import {
  readBlocklist,
  removeBlocklistItems,
} from "../../../lib/server/activity";
import { api, jsonBody } from "../../../lib/server/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(readBlocklist, request);
}

export function DELETE(request: Request) {
  return api(
    async () => removeBlocklistItems(await jsonBody(request)),
    request,
  );
}
