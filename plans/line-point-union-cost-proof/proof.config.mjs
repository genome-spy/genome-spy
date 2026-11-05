import { defineConfig } from "@playwright/test";
import { fileURLToPath, URL } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
    testDir: root + "packages/webgpu-renderer/tests",
    testMatch: [
        "line-union-area-proof.gpu.test.js",
        "line-union-cost-proof.gpu.test.js",
    ],
    workers: 1,
    timeout: 180000,
    use: {
        baseURL: "http://127.0.0.1:4798",
        channel: "chrome",
        launchOptions: {
            args: [
                "--enable-unsafe-webgpu",
                "--enable-features=WebGPU",
                "--ignore-gpu-blocklist",
                "--use-angle=metal",
            ],
        },
    },
    webServer: {
        command: "node tests/webgpuServer.js --port 4798",
        cwd: root + "packages/webgpu-renderer",
        url: "http://127.0.0.1:4798",
        reuseExistingServer: false,
    },
});
