import { testConnection } from "../../../../lib/server/arr";
import { instanceInput } from "../../../../lib/server/config";
import { api, jsonBody } from "../../../../lib/server/http";

export const runtime = "nodejs";

export function POST(request: Request) {
  return api(async () => {
    const input = instanceInput(await jsonBody(request));
    const version = await testConnection(input);
    return {
      success: true,
      version,
      message: "Connection successful. The instance has not been saved.",
    };
  });
}
