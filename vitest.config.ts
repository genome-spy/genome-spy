import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        projects: ["packages/*"],
        onConsoleLog(log) {
            if (log.includes("Lit is in dev mode.")) return false;
        },
    },
});
