// @vitest-environment jsdom

import { expect, test } from "vitest";
import { createHeadlessEngine as bootstrap } from "../genomeSpy/headlessBootstrap.js";
import { createSvg } from "../rendering/svg/index.js";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import { resolveBaseConfig } from "../config/resolveConfig.js";
import { DEFAULT_THEME_NAME, resolveThemeSelection } from "../config/themes.js";

const baseConfig = resolveBaseConfig({
    defaultConfig: INTERNAL_DEFAULT_CONFIG,
    builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
});

/** @param {Parameters<typeof bootstrap>[0]} spec */
const createHeadlessEngine = (spec) =>
    bootstrap(spec, { contextOptions: { baseConfig } });

test.each([false, true])(
    "scaled endpoint offsets follow padded, gapped rows through resize and zoom, reverse=%s",
    async (reverse) => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { source: 0, target: 0 },
                    { source: 0.25, target: 0.75 },
                ],
            },
            mark: { type: "link", linkShape: "line", y2Offset: 99 },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: {
                    datum: 0,
                    type: "index",
                    band: 0.5,
                    axis: null,
                    scale: {
                        domain: [0, 3],
                        paddingInner: 0.3,
                        paddingOuter: 0.2,
                        gapPositions: [1],
                        gapWidth: 12,
                        reverse,
                    },
                },
                y2: { datum: 1, band: 0.5 },
                yOffset: {
                    field: "source",
                    type: "quantitative",
                    scale: {
                        domain: [0, 1],
                        range: [0, { expr: "-height * bandstep('y', height)" }],
                    },
                },
                y2Offset: { field: "target" },
            },
        });
        const scale =
            /** @type {import("../genome/scaleIndex.js").ScaleIndex} */ (
                view.getScaleResolution("y").getScale()
            );
        expect(view.getScaleResolution("y2Offset")).toBe(
            view.getScaleResolution("yOffset")
        );

        for (const domain of [
            [0, 4],
            [0.25, 2.75],
        ]) {
            scale.domain(domain);
            for (const height of [160, 320]) {
                const { svg } = createSvg({
                    viewRoot: view,
                    logicalWidth: 200,
                    logicalHeight: height,
                });
                const [anchor, offset] = Array.from(
                    svg.querySelectorAll("path")
                ).map((path) => {
                    const coordinates = path
                        .getAttribute("d")
                        .match(/-?\d+(?:\.\d+)?/g)
                        .map(Number);
                    return {
                        source: coordinates[1],
                        target: coordinates.at(-1),
                    };
                });
                const mapping = scale.gapMapping(height);
                const signedStep = -height * mapping.step;
                // Offsets span the regular row step, excluding the gap at row 1.
                // SVG rounds each endpoint to 0.1 px, so a difference can lose 0.1 px.
                expect(
                    Math.abs(offset.source - anchor.source - 0.25 * signedStep)
                ).toBeLessThan(0.11);
                expect(
                    Math.abs(offset.target - anchor.target - 0.75 * signedStep)
                ).toBeLessThan(0.11);
                expect(anchor.source).toBeCloseTo(
                    height * (1 - mapping.position(0, 0.5)),
                    1
                );
                expect(anchor.target).toBeCloseTo(
                    height * (1 - mapping.position(1, 0.5)),
                    1
                );
                expect(scale(0.9)).toBe(scale(0));
            }
        }
    }
);

test("bandstep validates scale support and grouping-gap extents", async () => {
    const { view } = await createHeadlessEngine({
        data: { values: [{ row: 0, value: 1 }] },
        mark: "point",
        encoding: {
            x: { field: "value", type: "quantitative" },
            y: {
                field: "row",
                type: "index",
                scale: { gapPositions: [1], gapWidth: 8 },
            },
        },
    });
    /** @param {string} expr */
    const evaluate = (expr) => view.paramRuntime.createExpression({ expr })();
    expect(() => evaluate("bandstep('y')")).toThrow("requires a pixel extent");
    expect(() => evaluate("bandstep('y', -1)")).toThrow(
        "finite and nonnegative"
    );
    expect(() => evaluate("bandstep('x')")).toThrow(
        "does not support bandstep()"
    );
    expect(evaluate("bandstep('y', 0)")).toBe(0);
});

test("secondary offset values contribute to the primary scale domain", async () => {
    const { view } = await createHeadlessEngine({
        data: { values: [{ from: 0, to: 0.75 }] },
        mark: "rule",
        encoding: {
            x: { value: 0.2 },
            x2: { value: 0.8 },
            y: { value: 0.5 },
            y2: { value: 0.5 },
            yOffset: {
                field: "from",
                type: "quantitative",
                scale: { nice: false, zero: false, range: [0, 20] },
            },
            y2Offset: { field: "to" },
        },
    });
    expect(view.getScaleResolution("yOffset").getScale().domain()).toEqual([
        0, 0.75,
    ]);
});

test("scaled secondary offsets require a primary offset definition", async () => {
    await expect(
        createHeadlessEngine({
            data: { values: [{ offset: 0.5 }] },
            mark: "rule",
            encoding: {
                x: { value: 0 },
                x2: { value: 1 },
                y: { value: 0 },
                y2: { value: 1 },
                y2Offset: { field: "offset" },
            },
        })
    ).rejects.toThrow("y2Offset requires a scaled yOffset");
});

test("nested offset points render at the centers of their grouped bars", async () => {
    const { view } = await createHeadlessEngine({
        data: {
            values: [
                { category: "A", group: "first", value: 2 },
                { category: "A", group: "second", value: 3 },
            ],
        },
        encoding: {
            x: { field: "category", type: "nominal", axis: null },
            xOffset: { field: "group", type: "nominal" },
            y: { field: "value", type: "quantitative", axis: null },
        },
        layer: [{ mark: "rect" }, { mark: "point" }],
    });
    const { svg } = createSvg({
        viewRoot: view,
        logicalWidth: 300,
        logicalHeight: 200,
    });
    const rects = Array.from(
        svg.querySelectorAll('[data-mark-type="rect"] rect')
    );
    const points = Array.from(
        svg.querySelectorAll('[data-mark-type="point"] circle')
    );
    expect(points).toHaveLength(2);
    points.forEach((point, i) => {
        expect(+point.getAttribute("cx")).toBeCloseTo(
            +rects[i].getAttribute("x") + +rects[i].getAttribute("width") / 2,
            1
        );
    });
    expect(points[0].getAttribute("cx")).not.toBe(points[1].getAttribute("cx"));
});
