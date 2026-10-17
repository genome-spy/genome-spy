// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "../../config/defaultConfig.js";
import { resolveBaseConfig } from "../../config/resolveConfig.js";
import {
    DEFAULT_THEME_NAME,
    resolveThemeSelection,
} from "../../config/themes.js";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "./index.js";

const baseConfig = resolveBaseConfig({
    defaultConfig: INTERNAL_DEFAULT_CONFIG,
    builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
});

describe("SVG gradient legends", () => {
    const orientations =
        /** @type {Array<[import("../../spec/legend.js").LegendOrient, boolean]>} */ ([
            ["bottom", true],
            ["right", false],
        ]);

    test.each(orientations)(
        "preserves %s gradient geometry when resized",
        async (orient, horizontal) => {
            const render = await createLegendRenderer({
                orient,
                direction: horizontal ? "horizontal" : "vertical",
                legend: {
                    gradientThickness: 18,
                    gradientOpacity: 0.4,
                    gradientStrokeColor: "#456",
                    gradientStrokeWidth: 2,
                    tickCount: 2,
                },
            });
            const p = horizontal ? "x" : "y";
            const q = horizontal ? "y" : "x";
            const length = horizontal ? "width" : "height";
            const thickness = horizontal ? "height" : "width";
            const bounds = ["x", "y", "width", "height"];
            let previousLength = 0;

            for (const [width, height] of [
                [400, 240],
                [560, 360],
            ]) {
                const svg = render(width, height);
                const ramp = svg.querySelector('[data-name="gradientRamp"]');
                const rects = ramp.querySelectorAll(
                    '[data-mark-type="rect"] rect'
                );
                const rect = rects[0];
                const border = svg.querySelector(
                    '[data-name="gradientBorder"] [data-mark-type="rect"]'
                );
                const gradient = svg.querySelector(
                    'linearGradient[id^="legend-gradient-"]'
                );
                const ticks = Array.from(
                    svg.querySelectorAll('[data-name="gradientTicks"] line')
                );
                const labels = Array.from(
                    svg.querySelectorAll('[data-name="gradientLabels"] text')
                );

                expect(rects).toHaveLength(1);
                expect(rect.getAttribute("fill")).toBe(
                    `url(#${gradient.getAttribute("id")})`
                );
                expect(rect.getAttribute("fill-opacity")).toBe("0.4");
                expect(gradient.querySelectorAll("stop")).toHaveLength(66);
                expect(numericAttributes(rect, [thickness])).toEqual([18]);
                expect(
                    numericAttributes(border.querySelector("rect"), bounds)
                ).toEqual(numericAttributes(rect, bounds));
                expect(border.getAttribute("stroke")).toBe("#456");
                expect(border.getAttribute("stroke-width")).toBe("2");
                expect(+rect.getAttribute(length)).toBeGreaterThan(
                    previousLength
                );
                previousLength = +rect.getAttribute(length);

                expect(ticks).toHaveLength(3);
                expect(labels.map((label) => label.textContent)).toEqual([
                    "0",
                    "50",
                    "100",
                ]);
                const positions = ticks
                    .map((tick) => +tick.getAttribute(p + "1"))
                    .sort((a, b) => a - b);
                for (const [index, position] of positions.entries()) {
                    expect(position).toBeCloseTo(
                        +rect.getAttribute(p) + (previousLength * index) / 2,
                        0
                    );
                }
                for (const [index, tick] of ticks.entries()) {
                    expect(tick.getAttribute(p + "1")).toBe(
                        tick.getAttribute(p + "2")
                    );
                    expect(
                        Math.abs(
                            +tick.getAttribute(q + "2") -
                                +tick.getAttribute(q + "1")
                        )
                    ).toBe(4);
                    expect(
                        +tick.getAttribute(q + (horizontal ? "2" : "1"))
                    ).toBeCloseTo(+rect.getAttribute(q) + 18);
                    const labelPosition = labels[index]
                        .getAttribute("transform")
                        .match(/translate\(([-.\d]+) ([-.\d]+)\)/)
                        .slice(1)
                        .map(Number);
                    expect(labelPosition[horizontal ? 1 : 0]).toBeCloseTo(
                        +rect.getAttribute(q) + 26
                    );
                }
                expect(gradient.getAttribute(q + "1")).toBe(
                    gradient.getAttribute(q + "2")
                );
                expect(+gradient.getAttribute(p + "1")).toBe(
                    +rect.getAttribute(p) + (horizontal ? 0 : previousLength)
                );
                expect(+gradient.getAttribute(p + "2")).toBe(
                    +rect.getAttribute(p) + (horizontal ? previousLength : 0)
                );
            }
        }
    );

    test("keeps discrete gradient legends as color buckets", async () => {
        const render = await createLegendRenderer({
            orient: "bottom",
            direction: "horizontal",
            scale: {
                type: "quantize",
                domain: [0, 100],
                scheme: { name: "viridis", count: 4 },
            },
        });
        const svg = render();
        const ramp = svg.querySelector('[data-name="gradientRamp"]');

        expect(
            svg.querySelector('linearGradient[id^="legend-gradient-"]')
        ).toBeNull();
        expect(
            ramp.querySelectorAll('[data-mark-type="rect"] rect')
        ).toHaveLength(4);
    });

    test("uses a gradient for a continuous piecewise color range", async () => {
        // This matches the multi-stop scale used by the HCC1954 CN legend.
        const render = await createLegendRenderer({
            orient: "right",
            scale: {
                domain: [0, 1, 3, 8],
                range: ["#1060f8", "#f6f6f6", "#ff4000", "#801800"],
            },
        });
        const svg = render();
        const ramp = svg.querySelector('[data-name="gradientRamp"]');

        expect(
            ramp.querySelectorAll('[data-mark-type="rect"] rect')
        ).toHaveLength(1);
        expect(
            svg.querySelector('linearGradient[id^="legend-gradient-"]')
        ).not.toBeNull();
    });
});

/**
 * @param {object} options
 * @param {import("../../spec/legend.js").LegendOrient} options.orient
 * @param {import("../../spec/legend.js").LegendDirection} [options.direction]
 * @param {import("../../spec/scale.js").Scale} [options.scale]
 * @param {import("../../spec/legend.js").Legend} [options.legend]
 */
async function createLegendRenderer({
    orient,
    direction,
    scale = { scheme: "turbo" },
    legend,
}) {
    const { view } = await createHeadlessEngine(
        {
            config: { legend: { disable: false } },
            data: {
                values: [
                    { x: 0, y: 0, value: 0 },
                    { x: 1, y: 1, value: 100 },
                ],
            },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
                color: {
                    field: "value",
                    type: "quantitative",
                    scale,
                    legend: { orient, direction, ...legend },
                },
            },
        },
        {
            contextOptions: {
                baseConfig,
                viewFactoryOptions: { wrapRoot: true },
            },
        }
    );

    return (logicalWidth = 400, logicalHeight = 240) =>
        createSvg({
            viewRoot: view,
            logicalWidth,
            logicalHeight,
            background: null,
        }).svg;
}

/**
 * @param {Element} element
 * @param {string[]} attributes
 */
function numericAttributes(element, attributes) {
    return attributes.map((attribute) => +element.getAttribute(attribute));
}
