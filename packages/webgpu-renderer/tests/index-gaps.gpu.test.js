/* global document */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const [base, sharedCuts] of /** @type {const} */ ([
    [0, false],
    [2 ** 35, false],
    [2 ** 35, true],
])) {
    test(`fixed pixel gaps survive navigation and unequal placements at ${base} (shared: ${sharedCuts})`, async ({
        page,
    }) => {
        await ensureWebGPU(page);
        const fixture = { base, sharedCuts };
        const result = await page.evaluate(async (fixture) => {
            const { base, sharedCuts } = fixture;
            const [
                { createRenderer },
                { rectMark },
                { indexScale },
                { packHighPrecisionU32Array },
                { identityScale },
            ] = await Promise.all([
                import("/src/index.js"),
                import("/src/marks/rect.js"),
                import("/src/scales/index.js"),
                import("/src/utils/highPrecision.js"),
                import("/src/scales/identity.js"),
            ]);
            const canvas = document.createElement("canvas");
            canvas.width = 200;
            canvas.height = 100;
            document.body.appendChild(canvas);
            const renderer = await createRenderer(canvas);
            renderer.updateGlobals({ width: 200, height: 100, dpr: 1 });
            const placements = renderer.createPlacementSet({
                rectangles: new Float32Array([
                    0, 0, 0.5, 0.5, 0.5, 0.5, 0.25, 0.5,
                ]),
            });
            const gap = { gapPositions: [base + 10], gapWidth: 6 };
            const shared = sharedCuts
                ? renderer.createSharedPositionScale(
                      indexScale({ gapEnabled: true })
                  )
                : undefined;
            shared?.update({ start: base, end: base + 20, ...gap });
            /** @param {number[]} values @param {string} peer */
            const endpoint = (values, peer) => ({
                data: base
                    ? packHighPrecisionU32Array(values)
                    : new Uint32Array(values),
                type: "u32",
                inputComponents: base ? 2 : 1,
                scale: indexScale({
                    domain: [base, base + 20],
                    range: [0, 200],
                    band: 0,
                    ...(shared ? { sharedPosition: shared } : gap),
                    gapPeer: peer,
                }),
            });
            const mark = renderer.createMark(rectMark, {
                count: 2,
                placementIndex: { source: "draw" },
                channels: {
                    uniqueId: {
                        data: new Uint32Array([1, 2]),
                        type: "u32",
                    },
                    x: endpoint([base, base + 10], "x2"),
                    x2: endpoint([base + 10, base + 20], "x"),
                    y: { value: 0, scale: identityScale() },
                    y2: { value: 100, scale: identityScale() },
                    fill: { value: [0, 0, 1, 1] },
                    strokeOpacity: { value: 0, scale: identityScale() },
                },
            });
            const draw = () =>
                renderer.render({
                    draws: [0, 1].map((index) => ({
                        mark,
                        placement: {
                            set: placements,
                            index,
                            clipToPlacement: "xy",
                        },
                    })),
                });
            const sample = () =>
                Promise.all(
                    [
                        [46, 25],
                        [50, 25],
                        [54, 25],
                        [121, 75],
                        [125, 75],
                        [129, 75],
                    ].map(([x, y]) => renderer.pick(x, y))
                );
            draw();
            const initial = await sample();
            if (shared)
                shared.update({ start: base + 5, end: base + 15, ...gap });
            else
                for (const channel of ["x", "x2"])
                    mark.scales[channel].setDomain([base + 5, base + 15]);
            draw();
            const zoomed = await sample();
            placements.replace({
                rectangles: new Float32Array([
                    0, 0, 0.02, 0.5, 0.5, 0.5, 0.25, 0.5,
                ]),
            });
            draw();
            const exhausted = await renderer.pick(2, 25);
            placements.replace({
                rectangles: new Float32Array([
                    0, 0, 0.5, 0.5, 0.5, 0.5, 0.25, 0.5,
                ]),
            });
            draw();
            const recovered = await sample();
            if (shared)
                shared.update({
                    start: base + 5,
                    end: base + 15,
                    ...gap,
                    gapWidth: 0,
                });
            else
                for (const channel of ["x", "x2"])
                    mark.scales[channel].setGapWidth(0);
            draw();
            const closed = await renderer.pick(50, 25);
            renderer.destroy();
            canvas.remove();
            return { initial, zoomed, exhausted, recovered, closed };
        }, fixture);
        expect(result).toEqual({
            initial: [1, null, 2, 1, null, 2],
            zoomed: [1, null, 2, 1, null, 2],
            exhausted: null,
            recovered: [1, null, 2, 1, null, 2],
            closed: 2,
        });
    });
}
