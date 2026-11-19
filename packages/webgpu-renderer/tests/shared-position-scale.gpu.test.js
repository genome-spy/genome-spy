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
            { linearScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/rect.js"),
            import("/src/scales/band.js"),
            import("/src/scales/linear.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = 200;
        canvas.height = 100;
        document.body.append(canvas);

        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 200, height: 100, dpr: 1 });
        renderer.device.pushErrorScope("validation");
        const domain = [200, 5, 900];
        const band = bandScale({ domain });
        const linear = linearScale({ domain: [0, 1], range: [0, 100] });
        const sharedX = renderer.createSharedPositionScale(band);
        const sharedY = renderer.createSharedPositionScale(linear);
        const bandExtent = { start: 0, end: 3, gapPositions: [1], gapWidth: 8 };
        sharedX.update(bandExtent);
        sharedY.update({ start: 0, end: 1 });
        const createBindGroup = renderer.device.createBindGroup.bind(
            renderer.device
        );
        let bindGroups = 0;
        renderer.device.createBindGroup = (descriptor) => {
            bindGroups++;
            return createBindGroup(descriptor);
        };

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
                    gapEnabled: true,
                },
            });
            /** @param {number} position */
            const y = (position) =>
                shareY
                    ? {
                          value: position,
                          scale: { ...linear, sharedPosition: sharedY },
                      }
                    : {
                          value: 9,
                          type: "u32",
                          scale: bandScale({
                              domain: [9],
                              range: [25, 75],
                              band: position < 0.5 ? 0 : 1,
                              gapPositions: [2],
                              gapWidth: 8,
                          }),
                      };
            return renderer.createMark(rectMark, {
                count: domain.length,
                channels: {
                    uniqueId: {
                        data: Uint32Array.from(
                            domain,
                            (_, i) => offset + i + 1
                        ),
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
                renderer.pick(34, 50),
                renderer.pick(120, 50),
                renderer.pick(134, 50),
                renderer.pick(20, 10),
                renderer.pick(120, 10),
            ]);

        draw();
        const initial = await picks();
        sharedY.update({ start: 0.25, end: 0.75 });
        // Picking observes a shared update even before another visible render.
        const yMoved = await picks();
        const initialBindings = bindGroups;
        // Moving a cut keeps the bounds and ranks identical and still invalidates picks.
        sharedX.update({ ...bandExtent, gapPositions: [2] });
        const movedCut = await picks();
        const inPlaceBindings = bindGroups - initialBindings;
        sharedX.update({ ...bandExtent, gapPositions: [1, 2] });
        const grown = await picks();
        const grownBindings = bindGroups - initialBindings;
        sharedX.update({ ...bandExtent, gapPositions: [] });
        const empty = await picks();
        const emptyBindings = bindGroups - initialBindings;
        sharedX.update({ ...bandExtent, gapWidth: 120 });
        draw();
        const exhausted = await picks();
        renderer.destroyMark(first.markId);
        const survivingBindings = bindGroups;
        sharedX.update({ ...bandExtent, gapPositions: [1, 2, 3] });
        draw([second]);
        const surviving = await renderer.pick(120, 50);
        const error = (await renderer.device.popErrorScope())?.message;
        renderer.destroy();
        return {
            initial,
            yMoved,
            movedCut,
            inPlaceBindings,
            grown,
            grownBindings,
            empty,
            emptyBindings,
            exhausted,
            surviving,
            survivingRebinds: bindGroups - survivingBindings,
            error,
        };
    });

    expect(result).toEqual({
        initial: [1, null, 101, null, null, null],
        yMoved: [1, null, 101, null, 1, null],
        movedCut: [1, 2, 101, 102, 1, null],
        inPlaceBindings: 0,
        grown: [1, null, 101, null, 1, null],
        grownBindings: 2,
        empty: [1, 2, 101, 102, 1, null],
        emptyBindings: 2,
        exhausted: [null, null, null, null, null, null],
        surviving: 101,
        survivingRebinds: 1,
        error: undefined,
    });
});
