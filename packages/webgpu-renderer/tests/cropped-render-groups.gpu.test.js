import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const dpr of [1, 1.5]) {
    test(`cropped layers preserve coordinates, clipping and picking at DPR ${dpr}`, async ({
        page,
    }) => {
        await ensureWebGPU(page);
        const result = await page.evaluate(async (dpr) => {
            const { renderCroppedGroups } =
                await import("/tests/fixtures/croppedRenderGroups.js");
            return renderCroppedGroups(dpr);
        }, dpr);

        expect(result).toEqual({
            red: [128, 0, 0, 128],
            overlap: [64, 0, 64, 128],
            green: [0, 128, 0, 128],
            clipped: [0, 0, 0, 0],
            viewportNearEdge: [128, 0, 0, 128],
            viewportFarEdge: [128, 0, 0, 128],
            empty: [0, 0, 0, 0],
            picks: [42, 43, 44, null, 42, 42],
        });
    });
}
