import { registerHooks } from "node:module";
import { extname } from "node:path";

// Used only by the separate-process config writers. Vitest handles the suite's
// modules and mocks; these plain Node 24 children need TypeScript path resolution.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        url: "data:text/javascript,export%20%7B%7D",
        shortCircuit: true,
      };
    }
    if (specifier.startsWith(".") && !extname(specifier) && context.parentURL) {
      return nextResolve(
        new URL(`${specifier}.ts`, context.parentURL).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});
