import "server-only";

import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { type FileHandle, mkdir, open, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { z } from "zod";
import { ApiError, parseInput } from "./http";
import {
  configSchema,
  instanceInputSchema,
  preferencesSchema,
  type storedInstanceSchema,
} from "./schemas";

export type InstanceConfig = z.output<typeof storedInstanceSchema>;
type Config = z.output<typeof configSchema>;
export type AccountConfig = NonNullable<Config["account"]>;

export function instanceInput(value: unknown): Omit<InstanceConfig, "id"> {
  return parseInput(instanceInputSchema, value);
}

function configDirectory(): string {
  return process.env.ARRSENAL_CONFIG_DIR
    ? resolve(process.env.ARRSENAL_CONFIG_DIR)
    : join(homedir(), ".config", "arrsenal");
}

function isCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === code
  );
}

async function readAt(directory: string): Promise<Config> {
  let file: FileHandle | undefined;
  try {
    file = await open(
      join(directory, "config.json"),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 1024 * 1024)
      throw new Error("Invalid config file");
    return configSchema.parse(JSON.parse(await file.readFile("utf8")));
  } catch (error) {
    if (isCode(error, "ENOENT"))
      return configSchema.parse({ version: 1, instances: [] });
    throw new ApiError(
      500,
      "Unable to read Arrsenal config.json. Check its format and file permissions; it was not overwritten.",
    );
  } finally {
    await file?.close();
  }
}

export async function readInstances(): Promise<InstanceConfig[]> {
  return (await readAt(configDirectory())).instances;
}

export async function readPreferences(): Promise<Config["preferences"]> {
  return (await readAt(configDirectory())).preferences;
}

export async function readAccount(): Promise<AccountConfig | undefined> {
  return (await readAt(configDirectory())).account;
}

export function replaceAccount(
  expected: AccountConfig | undefined,
  account: AccountConfig | undefined,
): Promise<void> {
  return mutateConfig((config) => {
    if (
      config.account?.generation !== expected?.generation ||
      config.account?.username !== expected?.username ||
      config.account?.passwordHash !== expected?.passwordHash
    ) {
      throw new ApiError(409, "Account changed. Reload and retry.");
    }
    config.account = account;
  });
}

export function savePreferences(
  value: unknown,
): Promise<Config["preferences"]> {
  const preferences = parseInput(preferencesSchema, value);
  return mutateConfig((config) => {
    config.preferences = preferences;
    return preferences;
  });
}

const state = globalThis as typeof globalThis & {
  __arrsenalConfigWrites?: Map<string, Promise<unknown>>;
  __arrsenalInstanceListeners?: Set<() => void>;
};
state.__arrsenalConfigWrites ??= new Map();
const writes = state.__arrsenalConfigWrites;
state.__arrsenalInstanceListeners ??= new Set();
const instanceListeners = state.__arrsenalInstanceListeners;

export function subscribeInstanceChanges(listener: () => void): () => void {
  instanceListeners.add(listener);
  return () => {
    instanceListeners.delete(listener);
  };
}

async function mutateConfig<T>(change: (config: Config) => T): Promise<T> {
  const directory = configDirectory();
  const previous = writes.get(directory) ?? Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const lockPath = join(directory, "config.lock");
      const deadline = Date.now() + 5000;
      let lock: FileHandle | undefined;
      // The process queue survives Next development reloads; the exclusive lock also
      // serializes separate server processes sharing this config directory.
      while (!lock) {
        try {
          lock = await open(lockPath, "wx", 0o600);
        } catch (error) {
          if (!isCode(error, "EEXIST")) throw error;
          if (Date.now() >= deadline) {
            throw new ApiError(
              503,
              "Configuration is locked. Retry; if a writer crashed, stop Arrsenal before removing config.lock.",
            );
          }
          await sleep(25);
        }
      }
      const temporary = join(directory, `.config-${randomUUID()}.tmp`);
      try {
        const current = await readAt(directory);
        const result = change(current);
        const config = configSchema.parse(current);
        const file = await open(temporary, "wx", 0o600);
        try {
          await file.chmod(0o600);
          await file.writeFile(`${JSON.stringify(config, null, 2)}\n`, "utf8");
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, join(directory, "config.json"));
        return result;
      } finally {
        await unlink(temporary).catch(() => {});
        await lock.close();
        await unlink(lockPath);
      }
    });
  writes.set(directory, task);
  try {
    return await task;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      "Unable to save Arrsenal configuration. Check directory permissions.",
    );
  } finally {
    if (writes.get(directory) === task) writes.delete(directory);
  }
}

async function mutateInstances<T>(
  change: (instances: InstanceConfig[]) => T,
): Promise<T> {
  const result = await mutateConfig(({ instances }) => change(instances));
  for (const listener of instanceListeners) {
    try {
      listener();
    } catch {
      // A notification failure must not turn a committed write into a failed save.
    }
  }
  return result;
}

export function saveInstance(
  input: Omit<InstanceConfig, "id">,
): Promise<InstanceConfig> {
  return mutateInstances((instances) => {
    if (instances.some((instance) => instance.url === input.url)) {
      throw new ApiError(
        409,
        "An instance with this URL is already connected.",
      );
    }
    if (instances.length >= 32)
      throw new ApiError(400, "At most 32 instances can be connected.");
    const instance = { id: randomUUID(), ...input };
    instances.push(instance);
    return instance;
  });
}

export function updateInstance(
  expected: InstanceConfig,
  input: Omit<InstanceConfig, "id">,
): Promise<InstanceConfig> {
  return mutateInstances((instances) => {
    const index = instances.findIndex(
      (instance) => instance.id === expected.id,
    );
    if (index === -1) throw new ApiError(404, "Instance not found.");
    const current = instances[index];
    // Compare under the write lock, after the network verification completes.
    if (
      current.name !== expected.name ||
      current.kind !== expected.kind ||
      current.url !== expected.url ||
      current.apiKey !== expected.apiKey
    ) {
      throw new ApiError(
        409,
        "Instance changed during verification. Reload and retry.",
      );
    }
    if (
      instances.some(
        (instance) => instance.id !== expected.id && instance.url === input.url,
      )
    ) {
      throw new ApiError(
        409,
        "An instance with this URL is already connected.",
      );
    }
    const instance = { ...input, id: expected.id };
    instances[index] = instance;
    return instance;
  });
}

export function removeInstance(id: string): Promise<void> {
  return mutateInstances((instances) => {
    const index = instances.findIndex((instance) => instance.id === id);
    if (index === -1) throw new ApiError(404, "Instance not found.");
    instances.splice(index, 1);
  });
}

export async function getInstance(id: string): Promise<InstanceConfig> {
  const instance = (await readInstances()).find((entry) => entry.id === id);
  if (!instance)
    throw new ApiError(
      404,
      "Instance not found. Connect a Sonarr or Radarr instance first.",
    );
  return instance;
}
