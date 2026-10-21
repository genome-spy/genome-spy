// @vitest-environment jsdom

import { expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "../../config/defaultConfig.js";
import { resolveBaseConfig } from "../../config/resolveConfig.js";
import {
    DEFAULT_THEME_NAME,
    resolveThemeSelection,
} from "../../config/themes.js";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { createMultiPointSelection } from "../../selection/selection.js";
import { intervalSelection } from "../../selection/index.js";
import UnitView from "../../view/unitView.js";
import { calculateCanvasSize } from "../../view/viewUtils.js";
import { createSvg } from "./index.js";

test.each(/** @type {const} */ (["left", "right"]))(
    "exports every category in a multi-column %s legend",
    async (orient) => {
        const categories = Array.from(
            { length: 12 },
            (_, i) => `category-${i}`
        );
        let previousWidth = 300;
        for (const columns of [1, 2, 3]) {
            const { view } = await createHeadlessEngine(
                {
                    width: 300,
                    height: 300,
                    data: { values: categories.map((group) => ({ group })) },
                    mark: "point",
                    encoding: {
                        color: {
                            field: "group",
                            type: "nominal",
                            legend: {
                                orient,
                                columns,
                                title: null,
                                values: categories,
                            },
                        },
                    },
                    config: {
                        legend: {
                            disable: false,
                            symbolSize: 64,
                            labelFontSize: 12,
                            rowPadding: 4,
                            columnPadding: 16,
                            layout: { anchor: "middle", wrap: false },
                        },
                    },
                },
                {
                    contextOptions: {
                        baseConfig: resolveBaseConfig({
                            defaultConfig: INTERNAL_DEFAULT_CONFIG,
                            builtInTheme:
                                resolveThemeSelection(DEFAULT_THEME_NAME),
                        }),
                        viewFactoryOptions: { wrapRoot: true },
                    },
                }
            );
            // Spare canvas width would hide labels overflowing their legend.
            const { width = 0, height = 0 } = calculateCanvasSize(view);
            const { svg, warnings } = createSvg({
                viewRoot: view,
                logicalWidth: width,
                logicalHeight: height,
            });
            const labels = Array.from(
                svg.querySelectorAll("text"),
                (el) => el.textContent
            );

            expect(labels).toEqual(categories);
            expect(width).toBeGreaterThan(previousWidth);
            previousWidth = width;
            expect(warnings).toEqual([]);
            view.disposeSubtree();
        }
    }
);

test("exports opaque category symbols while selections dim the data marks", async () => {
    const { view } = await createHeadlessEngine(
        {
            name: "plot",
            data: {
                values: [
                    { x: 1, group: "a" },
                    { x: 2, group: "b" },
                ],
            },
            params: [
                { name: "hover", select: "point" },
                { name: "clicked", select: "point" },
                {
                    name: "region",
                    select: { type: "interval", encodings: ["x"] },
                },
            ],
            mark: { type: "point", filled: true },
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 3] },
                },
                color: {
                    field: "group",
                    type: "nominal",
                    legend: {
                        symbolOpacity: 1,
                        symbolStrokeColor: "black",
                        symbolStrokeWidth: 3,
                        symbolType: "square",
                    },
                },
                opacity: {
                    condition: [
                        { param: "hover", empty: false, value: 1 },
                        { param: "clicked", empty: false, value: 1 },
                        { param: "region", empty: false, value: 1 },
                    ],
                    value: {
                        expr: "region.intervals.x ? 0.1 : clicked.data.size ? 0.035 : 0.28",
                    },
                },
            },
        },
        {
            contextOptions: {
                baseConfig: resolveBaseConfig({
                    defaultConfig: INTERNAL_DEFAULT_CONFIG,
                    builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
                }),
                viewFactoryOptions: { wrapRoot: true },
            },
        }
    );
    const plot = /** @type {UnitView} */ (
        view
            .getDescendants()
            .find((child) => child.name == "plot" && child instanceof UnitView)
    );
    const data = Array.from(plot.getCollector().getData());

    /** @param {number} expectedOpacity */
    const check = async (expectedOpacity) => {
        await plot.paramRuntime.whenPropagated();
        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 400,
            logicalHeight: 200,
            background: null,
        });
        const symbols = svg.querySelector(
            '[data-name="symbols"] [data-mark-type="point"]'
        );
        expect(symbols).not.toBeNull();
        expect(symbols.getAttribute("fill-opacity")).toBe("1");
        expect(symbols.getAttribute("stroke-opacity")).toBe("1");
        expect(symbols.getAttribute("stroke-width")).toBe("3");
        expect(symbols.querySelectorAll("rect")).toHaveLength(2);
        expect(plot.mark.encoders.fillOpacity(data[1])).toBe(expectedOpacity);
    };

    await check(0.28);
    plot.paramRuntime.setValue("region", intervalSelection({ x: [0.5, 1.5] }));
    await check(0.1);
    plot.paramRuntime.setValue("region", intervalSelection({ x: null }));
    await check(0.28);
    plot.paramRuntime.setValue("clicked", createMultiPointSelection([data[0]]));
    await check(0.035);
    plot.paramRuntime.setValue("hover", createMultiPointSelection([data[1]]));
    await check(1);
    plot.paramRuntime.setValue("hover", createMultiPointSelection([]));
    plot.paramRuntime.setValue("clicked", createMultiPointSelection([]));
    await check(0.28);
});
