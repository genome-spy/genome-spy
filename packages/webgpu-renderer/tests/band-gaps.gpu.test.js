/* global document */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("categorical gaps retain picking across sparse-domain updates and unequal placements", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { rectMark },
            { bandScale },
            { identityScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/rect.js"),
            import("/src/scales/band.js"),
            import("/src/scales/identity.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = 200;
        canvas.height = 100;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 200, height: 100, dpr: 1 });
        const placements = renderer.createPlacementSet({
            rectangles: new Float32Array([0, 0, 0.5, 0.5, 0.5, 0.5, 0.25, 0.5]),
        });
        const domain = [200, 5, 900, 11];
        /** @param {number} band */
        const endpoint = (band) => ({
            data: new Uint32Array(domain),
            type: "u32",
            scale: bandScale({
                domain,
                range: [0, 200],
                band,
                gapPositions: [2],
                gapWidth: 8,
            }),
        });
        const mark = renderer.createMark(rectMark, {
            count: 4,
            placementIndex: { source: "draw" },
            channels: {
                uniqueId: { data: new Uint32Array([1, 2, 3, 4]), type: "u32" },
                x: endpoint(0),
                x2: endpoint(1),
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
                    [44, 25],
                    [50, 25],
                    [56, 25],
                    [119, 75],
                    [125, 75],
                    [131, 75],
                ].map(([x, y]) => renderer.pick(x, y))
            );

        draw();
        const initial = await sample();
        for (const axis of ["x", "x2"]) mark.scales[axis].setRange([200, 0]);
        draw();
        const reversed = await sample();
        for (const axis of ["x", "x2"])
            mark.scales[axis].setDomain([11, 900, 5, 200]);
        draw();
        const reordered = await sample();
        for (const axis of ["x", "x2"]) mark.scales[axis].setDomain([900, 200]);
        draw();
        const filtered = await Promise.all(
            [
                [25, 25],
                [75, 25],
            ].map(([x, y]) => renderer.pick(x, y))
        );
        for (const axis of ["x", "x2"]) {
            mark.scales[axis].setDomain(domain);
            mark.scales[axis].setRange([0, 200]);
            mark.scales[axis].setGapWidth(60);
        }
        draw();
        // Only the narrower placement is exhausted; sample a formerly filled cell.
        const exhausted = await Promise.all([
            renderer.pick(5, 25),
            renderer.pick(119, 75),
        ]);
        for (const axis of ["x", "x2"]) mark.scales[axis].setGapWidth(8);
        draw();
        const recovered = await sample();
        for (const axis of ["x", "x2"]) mark.scales[axis].setGapWidth(0);
        draw();
        const closed = await renderer.pick(50, 25);
        renderer.destroy();
        canvas.remove();
        return {
            initial,
            reversed,
            reordered,
            filtered,
            exhausted,
            recovered,
            closed,
        };
    });
    expect(result).toEqual({
        initial: [2, null, 3, 2, null, 3],
        reversed: [3, null, 2, 3, null, 2],
        reordered: [2, null, 3, 2, null, 3],
        filtered: [1, 3],
        exhausted: [1, null],
        recovered: [2, null, 3, 2, null, 3],
        closed: 3,
    });
});
