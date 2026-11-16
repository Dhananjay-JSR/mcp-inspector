import path from "node:path";

/**
 * Bundle core from source, not from its `tsc` output.
 *
 * `tsc` emits CommonJS, and esbuild then has to take the `require` branch of
 * every dependency's `exports` map. That pulls zod's CJS build, including
 * every locale, into the extension. Resolving the TypeScript source keeps the
 * import graph ESM and lets esbuild tree-shake it.
 */
export const coreSource = {
  name: "core-source",
  setup(build) {
    build.onResolve(
      { filter: /^@dhananjay-jsr\/mcp-inspector-core$/ },
      () => ({ path: path.resolve("packages/core/src/index.ts") }),
    );
    build.onResolve(
      { filter: /^@dhananjay-jsr\/mcp-inspector-core\/transport$/ },
      () => ({ path: path.resolve("packages/core/src/transport/index.ts") }),
    );
  },
};
