import assert from "node:assert/strict";
import {
    loadPlaywright,
    startDevServer,
    stopServer,
    waitForServer,
} from "./captureScreenshots.mjs";

/**
 * Run each renderer and variant in an isolated browser context using the native GPU.
 * @template {{ deviceScaleFactor: number }} T
 * @param {T[]} variants
 * @param {(page: import("playwright").Page, renderer: "canvas" | "webgl" | "webgpu", variant: T) => Promise<void>} test
 */
export async function testRenderers(variants, test) {
    const origin = "http://127.0.0.1:4174";
    const server = await startDevServer(origin);
    try {
        await waitForServer(origin, server);
        const { chromium } = await loadPlaywright();
        const browser = await chromium.launch({
            channel: "chrome",
            args: [
                "--enable-unsafe-webgpu",
                "--ignore-gpu-blocklist",
                "--use-angle=metal",
            ],
        });
        try {
            for (const renderer of /** @type {const} */ ([
                "canvas",
                "webgl",
                "webgpu",
            ])) {
                for (const variant of variants) {
                    const context = await browser.newContext({
                        deviceScaleFactor: variant.deviceScaleFactor,
                    });
                    try {
                        const page = await context.newPage();
                        await page.route("**/favicon.ico", (route) =>
                            route.fulfill({ status: 204 })
                        );
                        /** @type {string[]} */
                        const failures = [];
                        page.on("pageerror", (error) =>
                            failures.push(error.message)
                        );
                        page.on("console", (message) => {
                            if (message.type() == "error")
                                failures.push(message.text());
                        });
                        await page.goto(`${origin}/screenshot.html`);
                        await test(page, renderer, variant);
                        assert.deepEqual(
                            failures,
                            [],
                            `${renderer}: browser errors`
                        );
                    } finally {
                        await context.close();
                    }
                }
            }
        } finally {
            await browser.close();
        }
    } finally {
        await stopServer(server);
    }
}
