import { z } from "zod";

export const realtimeTopics = [
  "queue",
  "library",
  "episodes",
  "calendar",
  "instances",
  "options",
] as const;

// Only invalidation hints cross the browser boundary, never upstream payloads.
export const realtimeEventSchema = z.object({
  instanceId: z.string().min(1).max(100).optional(),
  topics: z.array(z.enum(realtimeTopics)).min(1).max(realtimeTopics.length),
});

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export type RealtimeTopic = RealtimeEvent["topics"][number];
