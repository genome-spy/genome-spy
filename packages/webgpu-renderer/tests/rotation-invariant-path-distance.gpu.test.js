/* global document */

import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("PathPoint distance scaling is invariant under rotation", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const counts = await page.evaluate(async () => {
        const [{ createRenderer }, { pathPointMark }, { identityScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/pathPoint.js"),
                import("/src/scales/identity.js"),
            ]);
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 256;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 256, height: 128, dpr: 2 });
        const handle = renderer.createMark(pathPointMark, {
            count: 2,
            paths: ["M0-1A1 1 0 1 1 0 1A1 1 0 1 1 0-1Z"],
            atlasFormat: "rgba16float",
            channels: {
                x: {
                    data: new Float32Array([64, 192]),
                    type: "f32",
                    scale: identityScale(),
                },
                y: { value: 64, scale: identityScale() },
                size: { value: 900 },
                shape: { value: 0 },
                fill: { value: [0.85, 0.25, 0.5, 1] },
                stroke: { value: [0, 0, 0, 1] },
                strokeWidth: { value: 4 },
                angle: {
                    data: new Float32Array([0, 45]),
                    type: "f32",
                },
            },
        });
        renderer.render({ draws: [{ mark: handle }] });
        await renderer.device.queue.onSubmittedWorkDone();
        const bitmap = await createImageBitmap(
            await (await fetch(canvas.toDataURL("image/png"))).blob()
        );
        const copy = new OffscreenCanvas(canvas.width, canvas.height);
        const context = copy.getContext("2d");
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
        ).data;
        const inkPixels = [0, 0];
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const offset = (y * canvas.width + x) * 4;
                const ink =
                    255 -
                    Math.min(
                        pixels[offset],
                        pixels[offset + 1],
                        pixels[offset + 2]
                    );
                if (ink > 2) {
                    inkPixels[x < canvas.width / 2 ? 0 : 1]++;
                }
            }
        }
        renderer.destroy();
        canvas.remove();
        return inkPixels;
    });

    // fwidth's L1 footprint made the 45-degree copy about 11% larger even
    // though rotating a circle cannot change its coverage.
    expect(Math.abs(counts[0] - counts[1])).toBeLessThan(16);
});
