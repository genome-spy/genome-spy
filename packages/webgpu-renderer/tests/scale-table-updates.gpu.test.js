/* global document */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("independent categorical scales keep rendering and picking after table relocation", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { pointMark },
            { ordinalScale },
            { identityScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/point.js"),
            import("/src/scales/ordinal.js"),
            import("/src/scales/identity.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 100;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 160, height: 100, dpr: 1 });
        const mark = renderer.createMark(pointMark, {
            channels: {
                uniqueId: { data: new Uint32Array([17, 29]), type: "u32" },
                x: {
                    data: new Uint32Array([10, 42]),
                    type: "u32",
                    scale: ordinalScale({ domain: [10, 42], range: [30, 90] }),
                },
                y: { value: 50, scale: identityScale() },
                size: { value: 100, scale: identityScale() },
                fill: {
                    data: new Uint32Array([7, 99]),
                    type: "u32",
                    scale: ordinalScale({
                        domain: [7, 99],
                        range: [
                            [0, 0, 1, 1],
                            [1, 0, 0, 1],
                        ],
                    }),
                },
            },
        });
        const draw = () => renderer.render({ draws: [{ mark }] });
        draw();
        const before = await Promise.all([
            renderer.pick(30, 50),
            renderer.pick(90, 50),
        ]);

        // Grow the earlier domain slice, relocating its range and the fill tables.
        mark.scales.x.setDomain([
            42,
            10,
            ...Array.from({ length: 100 }, (_, i) => 1000 + i),
        ]);
        draw();
        const relocated = await Promise.all([
            renderer.pick(30, 50),
            renderer.pick(90, 50),
        ]);
        mark.scales.x.setRange([50, 110, 140]);
        mark.scales.fill.setRange([
            [0, 1, 0, 1],
            [1, 1, 0, 1],
        ]);
        draw();
        const updated = await Promise.all([
            renderer.pick(30, 50),
            renderer.pick(50, 50),
            renderer.pick(110, 50),
        ]);
        renderer.destroy();
        canvas.remove();
        return { before, relocated, updated };
    });
    expect(result).toEqual({
        before: [17, 29],
        relocated: [29, 17],
        updated: [null, 29, 17],
    });
});
