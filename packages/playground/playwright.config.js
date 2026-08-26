import { defineConfig } from "@playwright/test";
import process from "node:process";

export default defineConfig({
    testDir: "./tests",
    testMatch: "*.playwright.js",
    use: {
        baseURL: "http://127.0.0.1:4173",
    },
    webServer: {
        command: "npm run dev -- --host 127.0.0.1 --port 4173",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
    },
});
