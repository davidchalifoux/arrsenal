import { api } from "../../../lib/server/http";
import { library } from "../../../lib/server/services";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(library, request);
}
