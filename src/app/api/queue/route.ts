import { api, jsonBody } from "../../../lib/server/http";
import {
  queue,
  removeQueueItem,
  retryQueueItem,
} from "../../../lib/server/services";

export const runtime = "nodejs";

export function GET() {
  return api(queue);
}

export function DELETE(request: Request) {
  return api(async () => removeQueueItem(await jsonBody(request)));
}

export function POST(request: Request) {
  return api(async () => retryQueueItem(await jsonBody(request)));
}
