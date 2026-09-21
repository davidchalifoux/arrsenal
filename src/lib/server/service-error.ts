import "server-only";

import type { ServiceError } from "../types";
import type { InstanceConfig } from "./config";
import { errorMessage } from "./http";

export function serviceError(
  instance: Pick<InstanceConfig, "id" | "name">,
  error: unknown,
): ServiceError {
  return {
    instanceId: instance.id,
    instanceName: instance.name,
    message: errorMessage(error),
  };
}
