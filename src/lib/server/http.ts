import "server-only";

import type { ZodType } from "zod";
import { authorize } from "./auth";
import { jsonObjectSchema } from "./schemas";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "An unexpected server error occurred.";
}

export async function api(
  action: () => Promise<unknown>,
  request?: Request,
): Promise<Response> {
  const response = await publicApi(async () => {
    if (!(await authorize(request?.headers.get("cookie") ?? null))) {
      throw new ApiError(401, "Authentication required.");
    }
    return action();
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function publicApi(
  action: () => Promise<unknown>,
): Promise<Response> {
  try {
    const result = await action();
    if (result instanceof Response) return result;
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json(
      { error: errorMessage(error) },
      {
        status: error instanceof ApiError ? error.status : 500,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
}

/** The origin the browser addressed, from its Host header. */
export function addressedOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  // Standalone request URLs use the bind address. The browser's Host is the
  // addressed origin; never substitute untrusted X-Forwarded-Host headers.
  if (!host) return requestUrl.origin;
  try {
    const addressedUrl = new URL(`${requestUrl.protocol}//${host}`);
    if (
      addressedUrl.username ||
      addressedUrl.password ||
      addressedUrl.pathname !== "/" ||
      addressedUrl.search ||
      addressedUrl.hash
    ) {
      throw new Error("Invalid Host");
    }
    return addressedUrl.origin;
  } catch {
    throw new ApiError(403, "Invalid request host.");
  }
}

export function mutationGuard(request: Request, bodyRequired = true): void {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (
    (origin !== null && origin !== addressedOrigin(request)) ||
    (site !== null && site !== "same-origin" && site !== "none")
  ) {
    throw new ApiError(403, "Mutations are only allowed from the same origin.");
  }
  if (
    (bodyRequired || request.body !== null) &&
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() !== "application/json"
  ) {
    throw new ApiError(415, "Use an application/json request body.");
  }
}

export async function jsonBody(
  request: Request,
  { maxBytes = 128 * 1024, timeoutMs = 10000 } = {},
): Promise<Record<string, unknown>> {
  mutationGuard(request);
  if (Number(request.headers.get("content-length")) > maxBytes) {
    throw new ApiError(413, "Request body is too large.");
  }
  if (!request.body) throw new ApiError(400, "A JSON object is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timeoutError: ApiError | undefined;
  const timeout = setTimeout(() => {
    timeoutError = new ApiError(408, "Request body timed out.");
    // Cancel closes pending reads even if the sender never finishes its JSON body.
    void reader.cancel().catch(() => {});
  }, timeoutMs);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "Request body is too large.");
      }
      chunks.push(value);
    }
    if (timeoutError) throw timeoutError;
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return parseInput(
      jsonObjectSchema,
      JSON.parse(new TextDecoder().decode(bytes)),
    );
  } catch (error) {
    if (timeoutError) throw timeoutError;
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Request body must be valid JSON.");
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}

export function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value, { error: () => "Invalid request." });
  if (!result.success) {
    // Return only safe schema messages, never Zod issues/inputs containing secrets.
    throw new ApiError(
      400,
      result.error.issues[0]?.message ?? "Invalid request.",
    );
  }
  return result.data;
}
