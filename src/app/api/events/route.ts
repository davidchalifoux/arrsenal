import {
  type RealtimeEvent,
  type RealtimeSnapshot,
  type RealtimeStatus,
  realtimeTopics,
} from "@/lib/realtime-events";
import { authorize } from "@/lib/server/auth";
import { ApiError, api } from "@/lib/server/http";
import { subscribeRealtime } from "@/lib/server/realtime";

export const runtime = "nodejs";
const encoder = new TextEncoder();
const maxBufferedBytes = 32 * 1024 * 1024;
const pageTopics: RealtimeEvent["topics"] = ["episodes", "calendar", "options"];

export async function GET(request: Request) {
  const response = await api(async () => {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new ApiError(403, "Events are only available from the same site.");
    }
    const cookie = request.headers.get("cookie");
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          let closed = false;
          let flushing = false;
          let heartbeat = false;
          let reset = true;
          let unsubscribe: (() => void) | undefined;
          let timer: NodeJS.Timeout | undefined;
          let pendingBytes = 0;
          const pending = new Map<string, Uint8Array>();
          const hints = new Map<string, RealtimeEvent>();

          cleanup = () => {
            if (closed) return;
            closed = true;
            pending.clear();
            hints.clear();
            pendingBytes = 0;
            clearInterval(timer);
            request.signal.removeEventListener("abort", abort);
            unsubscribe?.();
          };
          function abort() {
            if (closed) return;
            cleanup();
            controller.close();
          }
          function enqueue(bytes: Uint8Array) {
            if (closed) return;
            // Bound bytes, not records: full snapshots may be large. Slow
            // consumers recover through the initial reset on their next stream.
            if (bytes.byteLength > (controller.desiredSize ?? 0)) {
              abort();
              return;
            }
            controller.enqueue(bytes);
          }
          function send(event: string, data: unknown) {
            enqueue(
              encoder.encode(
                `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
              ),
            );
          }
          function buffer(key: string, event: string, data: unknown) {
            const bytes = encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            );
            pendingBytes +=
              bytes.byteLength - (pending.get(key)?.byteLength ?? 0);
            if (pendingBytes > maxBufferedBytes) {
              abort();
              return;
            }
            pending.set(key, bytes);
            void flush();
          }
          async function flush() {
            if (flushing || closed) return;
            flushing = true;
            try {
              while (!closed && (pending.size || heartbeat || reset)) {
                // Recheck before every batch, including events queued during auth.
                if (!(await authorize(cookie))) {
                  if (closed) return;
                  send("auth-required", {});
                  abort();
                  return;
                }
                if (closed) return;
                if (reset) {
                  reset = false;
                  send("invalidate", {
                    topics: [...realtimeTopics],
                    reset: true,
                  });
                }
                for (const frame of pending.values()) enqueue(frame);
                pending.clear();
                hints.clear();
                pendingBytes = 0;
                if (heartbeat) {
                  heartbeat = false;
                  enqueue(encoder.encode(": heartbeat\n\n"));
                }
              }
            } catch {
              // Errors may contain secrets; only normalized DTOs go out.
              abort();
            } finally {
              flushing = false;
            }
          }
          function receiveSnapshot(snapshot: RealtimeSnapshot) {
            if (closed) return;
            const [key] = snapshot.queryKey;
            if (
              snapshot.queryKey.length !== 1 ||
              (key !== "library" && key !== "queue" && key !== "instances")
            )
              return;
            buffer(key, "snapshot", snapshot);
          }
          function receiveStatus(status: RealtimeStatus) {
            if (!closed) buffer("status", "status", status);
          }
          function receiveInvalidation(event: RealtimeEvent) {
            if (closed || hints.has("*")) return;
            const topics = event.topics.filter((topic) =>
              pageTopics.includes(topic),
            );
            if (!topics.length) return;
            let key = event.instanceId
              ? JSON.stringify([event.instanceId, event.remoteId])
              : "*";
            if (key === "*" || (!hints.has(key) && hints.size >= 64)) {
              for (const scope of hints.keys()) {
                const frameKey = `hint:${scope}`;
                pendingBytes -= pending.get(frameKey)?.byteLength ?? 0;
                pending.delete(frameKey);
              }
              hints.clear();
              key = "*";
              hints.set(key, { topics: [...pageTopics] });
            } else {
              const previous = hints.get(key);
              if (previous) {
                for (const topic of topics)
                  if (!previous.topics.includes(topic))
                    previous.topics.push(topic);
              } else {
                hints.set(key, {
                  instanceId: event.instanceId,
                  ...(event.remoteId === undefined
                    ? {}
                    : { remoteId: event.remoteId }),
                  topics,
                });
              }
            }
            buffer(`hint:${key}`, "invalidate", hints.get(key));
          }
          request.signal.addEventListener("abort", abort, { once: true });
          if (request.signal.aborted) {
            abort();
            return;
          }
          enqueue(encoder.encode(": connected\n\n"));
          if (closed) return;
          try {
            unsubscribe = subscribeRealtime(
              receiveStatus,
              receiveSnapshot,
              receiveInvalidation,
            );
          } catch (error) {
            cleanup();
            throw error;
          }
          // Subscription callbacks may synchronously close or abort the stream.
          if (closed) {
            unsubscribe();
            return;
          }
          void flush();
          timer = setInterval(() => {
            heartbeat = true;
            void flush();
          }, 15_000);
        },
        cancel() {
          cleanup();
        },
      },
      new ByteLengthQueuingStrategy({ highWaterMark: maxBufferedBytes }),
    );
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }, request);
  response.headers.set("Cache-Control", "no-store, no-transform");
  return response;
}
