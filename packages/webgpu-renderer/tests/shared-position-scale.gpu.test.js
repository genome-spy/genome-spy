/* global document */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("marks share position buffers across endpoints and keep independent ranges", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { rectMark },
            { bandScale },
            { identityScale },
            { linearScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/rect.js"),
            import("/src/scales/band.js"),
            import("/src/scales/identity.js"),
            import("/src/scales/linear.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = 200;
        canvas.height = 100;
        document.body.append(canvas);

        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 200, height: 100, dpr: 1 });
        renderer.device.pushErrorScope("validation");
        const domain = [200, 5];
        const gapPositions = [1];
        const band = bandScale({ domain, gapPositions, gapWidth: 8 });
        const linear = linearScale({ domain: [0, 1], range: [0, 100] });
        const sharedX = renderer.createSharedPositionScale(band);
        const sharedY = renderer.createSharedPositionScale(linear);
        const bandExtent = { start: 0, end: 2, gapPositions, gapWidth: 8 };
        sharedX.update(bandExtent);
        sharedY.update({ start: 0, end: 1 });

        /** @param {number} offset @param {boolean} shareY */
        const createRects = (offset, shareY) => {
            /** @param {number} anchor */
            const x = (anchor) => ({
                data: new Uint32Array(domain),
                type: "u32",
                scale: {
                    ...band,
                    band: anchor,
                    range: [offset, offset + 100],
                    sharedPosition: sharedX,
                },
            });
            /** @param {number} position */
            const y = (position) =>
                shareY
                    ? {
                          value: position,
                          scale: { ...linear, sharedPosition: sharedY },
                      }
                    : { value: position * 100, scale: identityScale() };
            return renderer.createMark(rectMark, {
                count: 2,
                channels: {
                    uniqueId: {
                        data: new Uint32Array([offset + 1, offset + 2]),
                        type: "u32",
                    },
                    x: x(0),
                    x2: x(1),
                    y: y(0.25),
                    y2: y(0.75),
                    fill: { value: [0, 0, 1, 1] },
                },
            });
        };
        const first = createRects(0, true);
        const second = createRects(100, false);
        const draw = (marks = [first, second]) =>
            renderer.render({ draws: marks.map((mark) => ({ mark })) });
        const picks = () =>
            Promise.all([
                renderer.pick(20, 50),
                renderer.pick(50, 50),
                renderer.pick(120, 50),
                renderer.pick(150, 50),
                renderer.pick(20, 10),
                renderer.pick(120, 10),
            ]);

        draw();
        const initial = await picks();
        sharedY.update({ start: 0.25, end: 0.75 });
        const unchanged = sharedX.update({ ...bandExtent });
        // Picking observes a shared update even before another visible render.
        const yMoved = await picks();
        sharedX.update({ ...bandExtent, gapWidth: 120 });
        draw();
        const exhausted = await picks();
        renderer.destroyMark(first.markId);
        sharedX.update(bandExtent);
        draw([second]);
        const surviving = await renderer.pick(120, 50);
        const error = (await renderer.device.popErrorScope())?.message;
        renderer.destroy();
        return { initial, unchanged, yMoved, exhausted, surviving, error };
    });

    expect(result).toEqual({
        initial: [1, null, 101, null, null, null],
        unchanged: false,
        yMoved: [1, null, 101, null, 1, null],
        exhausted: [null, null, null, null, null, null],
        surviving: 101,
        error: undefined,
    });
});
