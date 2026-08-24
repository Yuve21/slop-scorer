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
      "@slop/reproduce": r("./packages/reproduce/src/index.ts"),
      "@slop/provenance": r("./packages/provenance/src/index.ts"),
      "@slop/detectors-image": r("./packages/detectors-image/src/index.ts"),
      "@slop/detectors-video": r("./packages/detectors-video/src/index.ts"),
      "@slop/detectors-audio": r("./packages/detectors-audio/src/index.ts"),
      "@slop/db": r("./packages/db/src/index.ts"),
      "@slop/gauntlet": r("./packages/gauntlet/src/index.ts"),
      "@slop/notary": r("./packages/notary/src/index.ts"),
      "slop-scorer-mcp": r("./packages/mcp-server/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
