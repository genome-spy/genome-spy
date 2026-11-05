import { defineConfig } from "@playwright/test";
import { fileURLToPath, URL } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
    testDir: root + "packages/webgpu-renderer/tests",
    testMatch: ["text-sharp-contract-proof.gpu.test.js"],
    workers: 1,
    timeout: 120000,
    use: {
        baseURL: "http://127.0.0.1:4797",
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
        command: "node tests/webgpuServer.js --port 4797",
        cwd: root + "packages/webgpu-renderer",
        url: "http://127.0.0.1:4797",
        reuseExistingServer: false,
    },
});
