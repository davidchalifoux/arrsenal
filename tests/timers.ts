import { jest } from "bun:test";
import { setImmediate } from "node:timers/promises";

// Flush promise-driven rescheduling between ticks, not just after a long jump.
export async function advanceTime(milliseconds: number) {
  await setImmediate();
  for (let remaining = milliseconds; remaining > 0; ) {
    const step = Math.min(remaining, 1);
    jest.advanceTimersByTime(step);
    await setImmediate();
    remaining -= step;
  }
}
