import { authApi, logout } from "@/lib/server/auth";

export const runtime = "nodejs";

export function POST(request: Request) {
  return authApi(() => logout(request));
}
