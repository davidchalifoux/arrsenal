import { beforeEach, expect, it, mock } from "bun:test";
import type { InstanceConfig } from "@/lib/server/config";

const request = mock(async (..._args: unknown[]): Promise<unknown> => ({}));
const publish = mock((..._args: unknown[]) => {});
mock.module("@/lib/server/arr", () => ({ arrRequest: request }));
mock.module("@/lib/server/changes", () => ({
  publishInstanceChange: publish,
}));

const { executeMutation } = await import("@/lib/server/mutations");
const { ApiError } = await import("@/lib/server/http");
const instance: InstanceConfig = {
  id: "sonarr",
  name: "Sonarr",
  kind: "sonarr",
  url: "http://sonarr.invalid",
  apiKey: "private-test-key",
};
beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({});
  publish.mockClear();
});

it("does not reconcile a rejected preflight or dispatch a write", async () => {
  const result = await executeMutation(
    instance,
    { operation: "search", remoteId: 22 },
    async () => {
      throw new ApiError(404, "Episode no longer exists.");
    },
  );
  expect(result).toMatchObject({
    status: 404,
    outcome: { state: "rejected", attemptedWrites: 0, confirmedWrites: 0 },
  });
  expect(request).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});

it("reconciles a timed-out write without retrying it or claiming acceptance", async () => {
  request.mockRejectedValueOnce(
    new ApiError(504, "Instance request timed out."),
  );
  const result = await executeMutation(
    instance,
    { operation: "search", remoteId: 22 },
    async (write) => {
      await write("command", {
        method: "POST",
        body: { name: "SeriesSearch", seriesId: 22 },
      });
      return "Search queued.";
    },
  );
  expect(result).toMatchObject({
    status: 504,
    outcome: { state: "uncertain", attemptedWrites: 1, confirmedWrites: 0 },
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(publish).toHaveBeenCalledTimes(1);
  expect(publish).toHaveBeenCalledWith(
    instance,
    null,
    expect.arrayContaining([
      "commands",
      "queue",
      "library",
      "episodes",
      "calendar",
    ]),
    22,
  );
});

it("reports acknowledged writes separately when a later write fails and reconciles once", async () => {
  request
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new ApiError(502, "Disk unavailable."));
  const result = await executeMutation(
    instance,
    { operation: "removeFiles", remoteId: 22 },
    async (write) => {
      for (const id of [70, 71, 72])
        await write(`episodefile/${id}`, { method: "DELETE" });
      return "Files deleted.";
    },
  );
  expect(result).toMatchObject({
    status: 502,
    outcome: { state: "partial", attemptedWrites: 2, confirmedWrites: 1 },
  });
  expect(request).toHaveBeenCalledTimes(2);
  expect(publish).toHaveBeenCalledTimes(1);
});

it("keeps unexpected error details private while reconciling uncertain writes", async () => {
  request.mockRejectedValueOnce(new Error(instance.apiKey));
  const result = await executeMutation(
    instance,
    { operation: "grab" },
    async (write) => {
      await write("release", { method: "POST" });
      return "Grab requested.";
    },
  );
  expect(JSON.stringify(result)).not.toContain(instance.apiKey);
  expect(result.outcome.state).toBe("uncertain");
  expect(publish).toHaveBeenCalledTimes(1);
});
