import { readFile } from "node:fs/promises";
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

/**
 * The SDK v2 browser shim initializes a schema base URI from
 * `self.location.origin`, which is undefined in the VS Code web extension
 * worker. Fall back to the library's own constant base URI instead.
 */
export const patchCfworkerBaseUri = {
  name: "patch-cfworker-base-uri",
  setup(build) {
    build.onLoad({ filter: /cfWorkerProvider-.*\.mjs$/ }, async (args) => {
      const source = await readFile(args.path, "utf8");
      const before =
        'let initialBaseURI = typeof self !== "undefined" && self.location && self.location.origin !== "null" ? new URL(self.location.origin + self.location.pathname + location.search) : new URL("https://github.com/cfworker");';
      if (!source.includes(before)) {
        throw new Error(
          "cfworker base URI changed; update patchCfworkerBaseUri in esbuild.core.mjs",
        );
      }
      return {
        contents: source.replace(
          before,
          'let initialBaseURI = new URL("https://github.com/cfworker");',
        ),
        loader: "js",
      };
    });
  },
};
