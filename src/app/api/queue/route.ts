import { api, jsonBody } from "../../../lib/server/http";
import {
  queue,
  removeQueueItem,
  retryQueueItem,
} from "../../../lib/server/services";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(queue, request);
}

export function DELETE(request: Request) {
  return api(async () => removeQueueItem(await jsonBody(request)), request);
}

export function POST(request: Request) {
  return api(async () => retryQueueItem(await jsonBody(request)), request);
}
