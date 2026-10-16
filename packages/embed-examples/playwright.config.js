import { defineConfig } from "playwright/test";
import process from "node:process";

export default defineConfig({
    testDir: "./tests",
    testMatch: "*.playwright.js",
    use: {
        baseURL: "http://127.0.0.1:4187",
        viewport: { width: 1200, height: 1000 },
        launchOptions: {
            args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        },
    },
    webServer: {
        command: "npm run dev -- --host 127.0.0.1 --port 4187 --strictPort",
        url: "http://127.0.0.1:4187",
        reuseExistingServer: !process.env.CI,
    },
});
