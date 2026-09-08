import {
  authApi,
  authStatus,
  disableAccount,
  saveAccount,
} from "@/lib/server/auth";

export const runtime = "nodejs";

export function GET(request: Request) {
  return authApi(() => authStatus(request.headers.get("cookie")));
}

export function POST(request: Request) {
  return authApi(() => saveAccount(request));
}

export function DELETE(request: Request) {
  return authApi(() => disableAccount(request));
}
