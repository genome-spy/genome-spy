/* global document */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("clamps placed marks, preserves strokes and diagonal rules, and hides collapsed geometry", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { pointMark },
            { rectMark },
            { ruleMark },
            { linkMark },
            { arrowMark },
            { textMark },
            { createTrueTypeFont },
            { identityScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/point.js"),
            import("/src/marks/rect.js"),
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
        const placements = renderer.createPlacementSet({
            rectangles: new Float32Array([0, 0.25, 1, 0.5]),
        });
        const font = createTrueTypeFont(
            await fetch("/src/fonts/DefaultFont.ttf").then((r) =>
                r.arrayBuffer()
            )
        );
        const hits = {};
        // All marks use the same occurrence and bounds; only geometry varies.
        /** @param {string} name
         * @param {Parameters<typeof renderer.createMark>[0]} definition
         * @param {Record<string, any>} channels
         * @param {number[][]} points
         * @param {Record<string, any>} [options]
         * @param {string} [clamp]
         */
        const check = async (
            name,
            definition,
            channels,
            points,
            options = {},
            clamp = "xy"
        ) => {
            const mark = renderer.createMark(definition, {
                count: 1,
                placementIndex: { source: "draw" },
                ...options,
                channels: {
                    uniqueId: { value: 7, type: "u32" },
                    size: { value: 4 },
                    ...(clamp.includes("x")
                        ? { xClampRange: { value: [20, 80] } }
                        : {}),
                    ...(clamp.includes("y")
                        ? { yClampRange: { value: [20, 80] } }
                        : {}),
                    ...Object.fromEntries(
                        Object.entries(channels).map(([key, value]) => [
                            key,
                            /^(x|x2|y|y2)$/.test(key)
                                ? { scale: identityScale(), ...value }
                                : value,
                        ])
                    ),
                },
            });
            renderer.render({
                draws: [{ mark, placement: { set: placements, index: 0 } }],
            });
            hits[name] = await Promise.all(
                points.map(([x, y]) => renderer.pick(x, y))
            );
            renderer.destroyMark(mark.markId);
        };
        const anchor = {
            x: { value: -100 },
            y: { value: 50 },
            xOffset: { value: 3 },
            yOffset: { value: 4 },
        };
        await check("point", pointMark, { ...anchor, size: { value: 100 } }, [
            [20, 54],
            [10, 54],
        ]);
        const rect = {
            x: { value: -100 },
            x2: { value: 60 },
            y: { value: 0 },
            y2: { value: 100 },
            fillOpacity: { value: 0 },
            strokeOpacity: { value: 1 },
            strokeWidth: { value: 4 },
        };
        await check("rect", rectMark, rect, [
            [18, 50],
            [30, 33],
            [10, 50],
        ]);
        await check(
            "xOnly",
            rectMark,
            rect,
            [
                [18, 30],
                [30, 24],
            ],
            {},
            "x"
        );
        await check(
            "collapsedRect",
            rectMark,
            { ...rect, x2: { value: -50 }, minWidth: { value: 20 } },
            [[20, 50]]
        );
        await check(
            "diagonal",
            ruleMark,
            {
                x: { value: -100 },
                x2: { value: 200 },
                y: { value: 0 },
                y2: { value: 100 },
            },
            [
                [30, 47],
                [70, 53],
                [30, 40],
                [70, 60],
            ]
        );
        // This extent used to lose the stroke width in float32.
        await check(
            "long",
            ruleMark,
            {
                x: { value: -1e8 },
                x2: { value: 1e8 + 100 },
                y: { value: -5e7 },
                y2: { value: 5e7 + 100 },
                strokeCap: { value: 2, type: "u32" },
            },
            [[50, 50]],
            {},
            ""
        );
        await check(
            "zero",
            ruleMark,
            {
                x: { value: 50 },
                x2: { value: 50 },
                y: { value: 50 },
                y2: { value: 50 },
                minLength: { value: 20 },
            },
            [[50, 50]]
        );
        for (const definition of [linkMark, arrowMark]) {
            const name = definition === linkMark ? "link" : "arrow";
            await check(
                name,
                definition,
                {
                    x: { value: -100 },
                    x2: { value: 200 },
                    y: { value: -100 },
                    y2: { value: 200 },
                },
                [[50, 50]],
                definition === linkMark ? { linkShape: "line" } : {}
            );
        }
        await check(
            "text",
            textMark,
            { ...anchor, text: { value: "M" }, size: { value: 16 } },
            [[20, 54]],
            { font, align: "center", baseline: "middle" }
        );
        for (const logoLetters of [false, true]) {
            const fitting = {
                text: { value: "M" },
                x: { value: -100 },
                x2: { value: 60 },
                y: { value: 40 },
                y2: { value: 60 },
                size: { value: 16 },
            };
            const points = Array.from({ length: 21 }, (_, i) => [
                20 + i * 2,
                50,
            ]);
            await check("fitting" + logoLetters, textMark, fitting, points, {
                font,
                squeeze: true,
                logoLetters,
            });
            await check(
                "collapsed" + logoLetters,
                textMark,
                { ...fitting, x2: { value: -50 } },
                points,
                { font, squeeze: true, logoLetters }
            );
        }
        renderer.destroy();
        canvas.remove();
        return hits;
    });
    expect(result).toMatchObject({
        point: [7, null],
        rect: [7, 7, null],
        xOnly: [7, 7],
        collapsedRect: [null],
        diagonal: [7, 7, null, null],
        long: [7],
        zero: [null],
        link: [7],
        arrow: [7],
        text: [7],
    });
    for (const logoLetters of [false, true]) {
        expect(result["fitting" + logoLetters]).toContain(7);
        expect(
            result["collapsed" + logoLetters].every((hit) => hit === null)
        ).toBe(true);
    }
});
