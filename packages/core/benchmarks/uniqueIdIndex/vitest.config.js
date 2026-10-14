import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["packages/core/benchmarks/uniqueIdIndex/*.test.js"],
    },
});
