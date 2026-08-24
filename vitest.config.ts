import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against TypeScript SOURCE, not dist, so `npm test` never depends on a
    // stale build. `npm run build` is what proves the published entrypoints resolve.
    alias: {
      "@slop/core": r("./packages/core/src/index.ts"),
      "@slop/detectors-web": r("./packages/detectors-web/src/index.ts"),
      "@slop/detectors-code": r("./packages/detectors-code/src/index.ts"),
      "slop-scorer-mcp": r("./packages/mcp-server/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
