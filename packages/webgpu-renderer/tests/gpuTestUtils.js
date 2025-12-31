import { test } from "@playwright/test";

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
export async function ensureWebGPU(page) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const status = await page.evaluate(async () => {
        const hasGPU = !!navigator.gpu;
        let adapterAvailable = false;
        if (hasGPU) {
            const adapter = await navigator.gpu.requestAdapter();
            adapterAvailable = !!adapter;
        }
        return {
            hasGPU,
            adapterAvailable,
            isSecureContext,
            userAgent: navigator.userAgent,
            platform: navigator.platform,
        };
    });

    if (!status.hasGPU) {
        test.skip(true, `WebGPU is not available: ${JSON.stringify(status)}`);
    }
    if (!status.adapterAvailable) {
        test.skip(
            true,
            `WebGPU adapter is not available: ${JSON.stringify(status)}`
        );
    }
}
