import { defineConfig } from "@playwright/test";

// eslint-disable-next-line no-undef
const isDarwin = process.platform === "darwin";
const serverPort = 4178;
const serverUrl = `http://127.0.0.1:${serverPort}`;
const launchArgs = [
    "--enable-unsafe-webgpu",
    "--enable-features=WebGPU",
    "--ignore-gpu-blocklist",
];

if (isDarwin) {
    launchArgs.push("--use-angle=metal");
} else {
    launchArgs.push("--use-angle=swiftshader");
}

export default defineConfig({
    testDir: "./tests",
    testMatch: "**/*.gpu.test.js",
    timeout: 30000,
    retries: 0,
    fullyParallel: false,
    use: {
        baseURL: serverUrl,
        headless: true,
        channel: "chrome",
        launchOptions: {
            args: launchArgs,
        },
    },
    webServer: {
        command: `node tests/webgpuServer.js --port ${serverPort}`,
        url: serverUrl,
        reuseExistingServer: true,
        timeout: 30000,
    },
    projects: [
        {
            name: "chromium",
            use: { browserName: "chromium" },
        },
    ],
});
