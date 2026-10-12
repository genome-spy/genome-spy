/* global document */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("clamps placed anchors and endpoints before geometry and picking", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { pointMark },
            { ruleMark },
            { linkMark },
            { arrowMark },
            { textMark },
            { createTrueTypeFont },
            { identityScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/point.js"),
            import("/src/marks/rule.js"),
            import("/src/marks/link.js"),
            import("/src/marks/arrow.js"),
            import("/src/marks/text.js"),
            import("/src/fonts/trueTypeFont.js"),
            import("/src/scales/identity.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 100;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 100, height: 100, dpr: 1 });
        renderer.device.pushErrorScope("validation");
        const placements = renderer.createPlacementSet({
            rectangles: new Float32Array([0, 0.25, 1, 0.5]),
        });
        const font = createTrueTypeFont(
            await fetch("/src/fonts/DefaultFont.ttf").then((r) =>
                r.arrayBuffer()
            )
        );
        const ids = [];
        for (const [index, definition] of [
            pointMark,
            pointMark,
            ruleMark,
            linkMark,
            arrowMark,
            textMark,
        ].entries()) {
            const isPoint = definition === pointMark;
            const isText = definition === textMark;
            const mark = renderer.createMark(definition, {
                count: 1,
                ...(isPoint && index === 1 ? { shape: "diamond" } : {}),
                ...(isText
                    ? { font, align: "center", baseline: "middle" }
                    : {}),
                ...(definition === linkMark ? { linkShape: "line" } : {}),
                placementIndex: { source: "draw" },
                channels: {
                    uniqueId: { value: 7, type: "u32" },
                    x: { value: -100, dynamic: true, scale: identityScale() },
                    y: {
                        value: isPoint || isText ? 50 : -100,
                        dynamic: true,
                        scale: identityScale(),
                    },
                    ...(!isPoint && !isText
                        ? {
                              x2: {
                                  value: 200,
                                  dynamic: true,
                                  scale: identityScale(),
                              },
                              y2: {
                                  value: 200,
                                  dynamic: true,
                                  scale: identityScale(),
                              },
                          }
                        : {}),
                    ...(isText ? { text: { value: "M" } } : {}),
                    size: { value: isPoint ? 100 : isText ? 16 : 4 },
                    xClampRange: { value: [20, 80], dynamic: true },
                    yClampRange: { value: [20, 80], dynamic: true },
                    xOffset: { value: 3 },
                    yOffset: { value: 4 },
                    ...(isPoint ? { dy: { value: 0, dynamic: true } } : {}),
                },
            });
            const draw = { mark, placement: { set: placements, index: 0 } };
            renderer.render({ draws: [draw] });
            await renderer.device.queue.onSubmittedWorkDone();
            ids.push(
                await renderer.pick(
                    isPoint || isText ? 20 : 50,
                    isPoint || isText ? 54 : 50
                )
            );
            if (!isPoint && !isText) {
                mark.values.x2.set(-50);
                mark.values.y2.set(-50);
                renderer.render({ draws: [draw] });
                ids.push(await renderer.pick(20, 35));
            }
            // Bounds are live and remain local to the resized occurrence.
            if (isPoint) {
                mark.values.dy.set(10);
                renderer.render({ draws: [draw] });
                ids.push(await renderer.pick(20, 64));
                mark.values.dy.set(0);
                placements.replace({
                    rectangles: new Float32Array([0, 0.5, 1, 0.25]),
                });
                renderer.render({ draws: [draw] });
                ids.push(await renderer.pick(20, 66));
                placements.replace({
                    rectangles: new Float32Array([0, 0.25, 1, 0.5]),
                });
            }
            renderer.destroyMark(mark.markId);
        }
        const error = await renderer.device.popErrorScope();
        renderer.destroy();
        canvas.remove();
        return { ids, error: error?.message ?? null };
    });
    expect(result.error).toBeNull();
    expect(result.ids).toEqual([
        7,
        7,
        7,
        7,
        7,
        7,
        7,
        null,
        7,
        null,
        7,
        null,
        7,
    ]);
});

test("clamps explicit text and logo fitting ranges and hides collapsed ranges", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const results = await page.evaluate(async () => {
        const [
            { createRenderer },
            { textMark },
            { identityScale },
            { createTrueTypeFont },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/text.js"),
            import("/src/scales/identity.js"),
            import("/src/fonts/trueTypeFont.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 100;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 100, height: 100, dpr: 1 });
        const font = createTrueTypeFont(
            await fetch("/src/fonts/DefaultFont.ttf").then((r) =>
                r.arrayBuffer()
            )
        );
        const hits = [];
        for (const logoLetters of [false, true]) {
            const mark = renderer.createMark(textMark, {
                count: 1,
                font,
                logoLetters,
                squeeze: true,
                channels: {
                    text: { value: "M" },
                    uniqueId: { value: 9, type: "u32" },
                    x: { value: -100, scale: identityScale() },
                    x2: { value: 60, dynamic: true, scale: identityScale() },
                    y: { value: 40, scale: identityScale() },
                    y2: { value: 60, scale: identityScale() },
                    size: { value: 16 },
                    xClampRange: { value: [20, 80] },
                    yClampRange: { value: [20, 80] },
                },
            });
            renderer.render({ draws: [{ mark }] });
            let hit = null;
            for (let y = 40; y <= 60 && hit === null; y += 2) {
                for (let x = 20; x <= 60 && hit === null; x += 2) {
                    hit = await renderer.pick(x, y);
                }
            }
            hits.push(hit);
            mark.values.x2.set(-50);
            renderer.render({ draws: [{ mark }] });
            hits.push(await renderer.pick(20, 50));
            renderer.destroyMark(mark.markId);
        }
        renderer.destroy();
        canvas.remove();
        return hits;
    });
    expect(results).toEqual([9, null, 9, null]);
});
