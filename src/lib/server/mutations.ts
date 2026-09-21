import "server-only";

import type { RealtimeTopic } from "../realtime-events";
import type { ActionResponse, MutationOutcome, ServiceError } from "../types";
import { arrRequest } from "./arr";
import { publishInstanceChange } from "./changes";
import type { InstanceConfig } from "./config";
import { ApiError } from "./http";
import { serviceError } from "./service-error";

// Commands can change these resources immediately and again on completion.
// Completion notifications use the same publication path as local writes.
const effects = {
  add: ["library", "queue", "instances", "commands", "calendar", "episodes"],
  remove: ["library", "queue", "instances", "calendar", "episodes"],
  removeFiles: ["library", "queue", "instances", "calendar", "episodes"],
  search: ["commands", "queue", "library", "episodes", "calendar"],
  grab: ["commands", "queue", "library", "episodes", "calendar"],
  removeQueue: ["commands", "queue", "library", "episodes", "calendar"],
  retryQueue: ["commands", "queue", "library", "episodes", "calendar"],
} satisfies Record<string, RealtimeTopic[]>;

type MutationScope = { operation: keyof typeof effects; remoteId?: number };
type WriteOptions = Omit<
  NonNullable<Parameters<typeof arrRequest>[2]>,
  "method" | "signal" | "image"
> & { method: "POST" | "DELETE" };
type Writer = (path: string, options: WriteOptions) => Promise<unknown>;
type Work = (write: Writer) => Promise<string>;
type MutationResult = {
  status: number;
  message: string;
  outcome: MutationOutcome;
  error?: ServiceError;
};

export function mutationFailure(
  instance: Pick<InstanceConfig, "id" | "name">,
  cause: unknown,
  attemptedWrites = 0,
  confirmedWrites = 0,
): MutationResult {
  const error = serviceError(instance, cause);
  return {
    status: cause instanceof ApiError ? cause.status : 500,
    message: error.message,
    error,
    outcome: {
      instanceId: instance.id,
      state: confirmedWrites
        ? "partial"
        : attemptedWrites
          ? "uncertain"
          : "rejected",
      attemptedWrites,
      confirmedWrites,
    },
  };
}

export async function executeMutation(
  instance: InstanceConfig,
  scope: MutationScope,
  work: Work,
): Promise<MutationResult> {
  let attemptedWrites = 0;
  let confirmedWrites = 0;
  const write: Writer = async (path, options) => {
    // Once dispatched, a failed response cannot prove that no write happened.
    attemptedWrites++;
    const result = await arrRequest(instance, path, options);
    confirmedWrites++;
    return result;
  };
  try {
    const message = await work(write);
    return {
      status: 200,
      message,
      outcome: {
        instanceId: instance.id,
        state: "accepted",
        attemptedWrites,
        confirmedWrites,
      },
    };
  } catch (error) {
    return mutationFailure(instance, error, attemptedWrites, confirmedWrites);
  } finally {
    // Reconcile once per target, including partial writes and ambiguous failures.
    // Validation/read failures need no reconciliation. Never retry a write here.
    if (attemptedWrites) {
      publishInstanceChange(
        instance,
        null,
        effects[scope.operation],
        scope.remoteId,
      );
    }
  }
}

export function actionResponse(body: ActionResponse, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function runAction(
  instance: InstanceConfig,
  scope: MutationScope,
  work: Work,
): Promise<Response> {
  const result = await executeMutation(instance, scope, work);
  return actionResponse(
    {
      success: !result.error,
      message: result.message,
      outcomes: [result.outcome],
      ...(result.error ? { errors: [result.error] } : {}),
    },
    result.status,
  );
}
