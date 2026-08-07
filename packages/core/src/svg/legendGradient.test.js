// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import { resolveBaseConfig } from "../config/resolveConfig.js";
import { DEFAULT_THEME_NAME, resolveThemeSelection } from "../config/themes.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { createSvg } from "./index.js";

const baseConfig = resolveBaseConfig({
    defaultConfig: INTERNAL_DEFAULT_CONFIG,
    builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
});

describe("SVG gradient legends", () => {
    const orientations =
        /** @type {Array<[import("../spec/legend.js").LegendOrient, boolean]>} */ ([
            ["bottom", true],
            ["right", false],
        ]);

    test.each(orientations)(
        "uses one gradient-filled rect for a %s legend",
        async (orient, horizontal) => {
            const svg = await createLegendSvg({ orient });
            const ramp = svg.querySelector('[data-view-name="gradientRamp"]');
            const rects = ramp.querySelectorAll('[data-mark-type="rect"] rect');
            const gradient = svg.querySelector(
                'linearGradient[id^="legend-gradient-"]'
            );

            expect(rects).toHaveLength(1);
            expect(rects[0].getAttribute("fill")).toBe(
                `url(#${gradient.getAttribute("id")})`
            );
            expect(gradient.querySelectorAll("stop")).toHaveLength(66);
            if (horizontal) {
                expect(+gradient.getAttribute("x1")).toBeLessThan(
                    +gradient.getAttribute("x2")
                );
                expect(gradient.getAttribute("y1")).toBe(
                    gradient.getAttribute("y2")
                );
            } else {
                expect(gradient.getAttribute("x1")).toBe(
                    gradient.getAttribute("x2")
                );
                expect(+gradient.getAttribute("y1")).toBeGreaterThan(
                    +gradient.getAttribute("y2")
                );
            }
        }
    );

    test("keeps discrete gradient legends as color buckets", async () => {
        const svg = await createLegendSvg({
            orient: "bottom",
            scale: {
                type: "quantize",
                domain: [0, 100],
                scheme: { name: "viridis", count: 4 },
            },
        });
        const ramp = svg.querySelector('[data-view-name="gradientRamp"]');

        expect(
            svg.querySelector('linearGradient[id^="legend-gradient-"]')
        ).toBeNull();
        expect(
            ramp.querySelectorAll('[data-mark-type="rect"] rect')
        ).toHaveLength(4);
    });

    test("uses a gradient for a continuous piecewise color range", async () => {
        // This matches the multi-stop scale used by the HCC1954 CN legend.
        const svg = await createLegendSvg({
            orient: "right",
            scale: {
                domain: [0, 1, 3, 8],
                range: ["#1060f8", "#f6f6f6", "#ff4000", "#801800"],
            },
        });
        const ramp = svg.querySelector('[data-view-name="gradientRamp"]');

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
 * @param {import("../spec/legend.js").LegendOrient} options.orient
 * @param {import("../spec/scale.js").Scale} [options.scale]
 */
async function createLegendSvg({ orient, scale = { scheme: "turbo" } }) {
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
                    legend: { orient },
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

    return createSvg({
        viewRoot: view,
        logicalWidth: 400,
        logicalHeight: 240,
        background: null,
    }).svg;
}
