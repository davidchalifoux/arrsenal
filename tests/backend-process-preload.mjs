import { mock } from "bun:test";

// Bun resolves TypeScript directly; only the server-only marker needs replacing.
mock.module("server-only", () => ({}));
