import { defineConfig } from "playwright/test";
import process from "node:process";

export default defineConfig({
    testDir: "./tests",
    testMatch: "**/*.playwright.js",
    workers: 1,
    use: { baseURL: "http://127.0.0.1:4174" },
    webServer: {
        command: "npm run dev",
        env: { PORT: "4174" },
        url: "http://127.0.0.1:4174",
        reuseExistingServer: !process.env.CI,
    },
});
