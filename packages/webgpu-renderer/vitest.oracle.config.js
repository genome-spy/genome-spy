import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        setupFiles: ["./vitest.setup.js"],
        include: ["tests/oracles/msdfgen/**/*.test.js"],
        exclude: ["**/*.gpu.test.js"],
    },
});
