import "server-only";

import { randomBytes } from "node:crypto";

// Uploaded NZB and torrent files wait here until the instance downloads them
// from their one-time link. A delay profile can hold a release for hours first.
const lifetimeMs = 24 * 60 * 60 * 1000;
const maxHeldBytes = 64 * 1024 * 1024;

export type HeldFile = { bytes: Uint8Array<ArrayBuffer>; contentType: string };
type Held = HeldFile & { expires: number };

const globalStore = globalThis as typeof globalThis & {
  __arrsenalReleaseFiles?: Map<string, Held>;
};
// Survive development reloads, like the configuration mutation queue.
globalStore.__arrsenalReleaseFiles ??= new Map<string, Held>();
const held = globalStore.__arrsenalReleaseFiles;

function prune(now = Date.now()) {
  for (const [token, entry] of held)
    if (entry.expires <= now) held.delete(token);
}

export function holdFile(file: HeldFile): string {
  prune();
  let total = file.bytes.byteLength;
  for (const entry of held.values()) total += entry.bytes.byteLength;
  // Map iteration is insertion order, so the oldest uploads go first.
  for (const [token, entry] of held) {
    if (total <= maxHeldBytes) break;
    total -= entry.bytes.byteLength;
    held.delete(token);
  }
  const token = randomBytes(32).toString("base64url");
  held.set(token, { ...file, expires: Date.now() + lifetimeMs });
  return token;
}

/** Returns the file once; the link stops working after the first download. */
export function takeFile(token: string): HeldFile | undefined {
  prune();
  const entry = held.get(token);
  held.delete(token);
  return entry;
}

export function isFileHeld(token: string): boolean {
  prune();
  return held.has(token);
}

export function dropFile(token: string): void {
  held.delete(token);
}
