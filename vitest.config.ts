import { defineConfig } from "vitest/config";

const suppressedConsoleLogs = [
    /Lit is in dev mode\./,
    /Cannot load font:/,
    /Could not load font metadata\./,
];

/**
 * @param {string} log
 */
function shouldSuppressConsoleLog(log) {
    return suppressedConsoleLogs.some((pattern) => pattern.test(log));
}

export default defineConfig({
    test: {
        projects: [
            "packages/*",
            {
                extends: true,
                test: {
                    name: "release-tools",
                    environment: "node",
                    include: ["scripts/*.test.mjs"],
                    testTimeout: 30000,
                },
            },
        ],
        onConsoleLog(log) {
            if (shouldSuppressConsoleLog(log)) {
                return false;
            }
        },
    },
});
