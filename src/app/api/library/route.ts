import { api } from "../../../lib/server/http";
import { library } from "../../../lib/server/services";

export const runtime = "nodejs";

export function GET() {
  return api(library);
}
