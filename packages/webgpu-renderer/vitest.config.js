import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        setupFiles: ["./vitest.setup.js"],
        exclude: ["**/*.gpu.test.js", "tests/oracles/msdfgen/**/*.test.js"],
    },
});
