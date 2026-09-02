/* global document */

import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("PathPoint renders an ASCII TrueType glyph from the GPU atlas", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { createAsciiTrueTypeFont },
            { pathPointMark },
            { identityScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/fonts/trueTypeFont.js"),
            import("/src/marks/pathPoint.js"),
            import("/src/scales/identity.js"),
        ]);
        const response = await fetch(
            "/node_modules/polished/docs/assets/fonts/TTF/SourceCodePro-Regular.ttf"
        );
        const font = createAsciiTrueTypeFont(await response.arrayBuffer());
        const glyph = font.characters.get("I");
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 128, height: 128, dpr: 2 });
        const handle = renderer.createMark(pathPointMark, {
            count: 1,
            paths: font.paths,
            atlasOptions: {
                tileSize: 96,
                shapePadding: 28,
                spread: 24,
                normalizationSpan: font.unitsPerEm,
            },
            channels: {
                uniqueId: { data: new Uint32Array([23]), type: "u32" },
                x: { value: 64, scale: identityScale() },
                y: { value: 64, scale: identityScale() },
                size: { value: 4096 },
                shape: { value: glyph.pathIndex },
                fill: { value: [0.1, 0.3, 0.8, 1] },
                stroke: { value: [0, 0, 0, 1] },
                strokeWidth: { value: 1.5 },
            },
        });

        renderer.render({ draws: [{ mark: handle }] });
        await renderer.device.queue.onSubmittedWorkDone();
        const center = await renderer.pick(64, 64);
        const outside = await renderer.pick(12, 12);
        renderer.destroy();
        canvas.remove();
        return {
            center,
            outside,
            pathCount: font.paths.length,
            unitsPerEm: font.unitsPerEm,
        };
    });

    expect(result).toEqual({
        center: 23,
        outside: null,
        pathCount: 94,
        unitsPerEm: 1000,
    });
});
