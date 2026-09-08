import { type RealtimeEvent, realtimeTopics } from "@/lib/realtime-events";
import { authorize } from "@/lib/server/auth";
import { ApiError, api } from "@/lib/server/http";
import { subscribeRealtime } from "@/lib/server/realtime";

export const runtime = "nodejs";

const encoder = new TextEncoder();

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
          let unsubscribe = () => {};
          let timer: NodeJS.Timeout | undefined;
          const pending = new Map<
            string | undefined,
            Set<RealtimeEvent["topics"][number]>
          >();

          cleanup = () => {
            if (closed) return;
            closed = true;
            pending.clear();
            clearInterval(timer);
            request.signal.removeEventListener("abort", abort);
            unsubscribe();
          };
          function abort() {
            if (closed) return;
            cleanup();
            controller.close();
          }
          function enqueue(text: string) {
            if (closed) return;
            // Disconnect slow consumers instead of buffering an unbounded stream.
            // Reopening the stream sends a full invalidation to recover lost hints.
            if ((controller.desiredSize ?? 0) <= 0) {
              abort();
              return;
            }
            controller.enqueue(encoder.encode(text));
          }
          async function flush() {
            if (flushing || closed) return;
            flushing = true;
            try {
              while (!closed && (pending.size > 0 || heartbeat)) {
                const events = [...pending].map(([instanceId, topics]) => ({
                  instanceId,
                  topics: [...topics],
                }));
                pending.clear();
                heartbeat = false;
                // A cookie valid at stream creation can be revoked or expire.
                // Recheck before delivering each batch, and during quiet periods.
                const authorized = await authorize(cookie);
                if (closed) return;
                if (!authorized) {
                  enqueue("event: auth-required\ndata: {}\n\n");
                  abort();
                  return;
                }
                if (events.length === 0) enqueue(": heartbeat\n\n");
                for (const event of events) {
                  enqueue(
                    `event: invalidate\ndata: ${JSON.stringify(event)}\n\n`,
                  );
                }
              }
            } catch {
              // Never put configuration errors or upstream secrets on the wire.
              abort();
            } finally {
              flushing = false;
            }
          }
          function receive(event: RealtimeEvent) {
            if (closed) return;
            let topics = pending.get(event.instanceId);
            if (!topics) {
              if (pending.size >= 64) {
                abort();
                return;
              }
              topics = new Set();
              pending.set(event.instanceId, topics);
            }
            for (const topic of event.topics) topics.add(topic);
            void flush();
          }
          request.signal.addEventListener("abort", abort, { once: true });
          if (request.signal.aborted) {
            abort();
            return;
          }
          enqueue(": connected\n\n");
          unsubscribe = subscribeRealtime(receive);
          receive({ topics: [...realtimeTopics] });
          timer = setInterval(() => {
            heartbeat = true;
            void flush();
          }, 15_000);
        },
        cancel() {
          cleanup();
        },
      },
      new ByteLengthQueuingStrategy({ highWaterMark: 16_384 }),
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
