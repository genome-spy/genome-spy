// @vitest-environment jsdom

import { expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "../../config/defaultConfig.js";
import { resolveBaseConfig } from "../../config/resolveConfig.js";
import {
    DEFAULT_THEME_NAME,
    resolveThemeSelection,
} from "../../config/themes.js";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "../../rendering/svg/index.js";

/** @param {import("../../spec/root.js").RootSpec} spec */
function createView(spec) {
    return createHeadlessEngine(spec, {
        contextOptions: {
            baseConfig: resolveBaseConfig({
                defaultConfig: INTERNAL_DEFAULT_CONFIG,
                builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
            }),
        },
    });
}

/** @param {import("../view.js").default} view */
function render(view) {
    const { svg, warnings } = createSvg({
        viewRoot: view,
        logicalWidth: 480,
        logicalHeight: 240,
        background: null,
    });
    expect(warnings).toEqual([]);
    return svg;
}

test.each([false, true])(
    "legend paint retains its contributing scope with collected=%s",
    async (collected) => {
        const legend = {
            title: "Width",
            labelColor: {
                expr: "width == 160 && height == 90 ? palette.foreground : 'wrong'",
            },
            titleColor: {
                expr: "width == 160 && height == 90 ? palette.foreground : 'wrong'",
            },
            symbolStrokeColor: { expr: "palette.foreground" },
            symbolStrokeWidth: 2,
            symbolOpacity: { expr: "palette.opacity" },
            backgroundFill: { expr: "palette.background" },
        };
        /**
         * Authored width/height params deliberately differ from generated
         * legend dimensions, including the generated body's forced scope.
         * @param {string} name
         * @param {string} foreground
         * @param {number} width
         * @param {number} height
         * @param {import("../../spec/legend.js").Legend | null} legendProps
         * @returns {import("../../spec/view.js").UnitSpec}
         */
        const plot = (name, foreground, width, height, legendProps) => ({
            name,
            width,
            height,
            params: [
                { name: "width", value: width },
                { name: "height", value: height },
                {
                    name: "palette",
                    value: { foreground, opacity: 0.5, background: "pink" },
                },
            ],
            data: { values: [{ size: 1 }, { size: 4 }] },
            mark: {
                type: "point",
                filled: true,
                color: {
                    expr: `width == ${width} && height == ${height} ? palette.foreground : 'wrong'`,
                },
            },
            encoding: {
                size: {
                    field: "size",
                    type: "quantitative",
                    legend: legendProps,
                },
            },
        });
        const { view } = await createView({
            config: { legend: { disable: false } },
            resolve: { scale: { size: "shared" }, legend: { size: "shared" } },
            hconcat: collected
                ? [
                      plot("aSource", "red", 120, 60, null),
                      plot("zDefinition", "blue", 160, 90, legend),
                  ]
                : [plot("zDefinition", "blue", 160, 90, legend)],
        });
        try {
            const definition = view
                .getDescendants()
                .find((child) => child.name === "zDefinition");
            const source = collected
                ? view
                      .getDescendants()
                      .find((child) => child.name === "aSource")
                : definition;
            /** @param {string} fill @param {string} stroke @param {string} opacity @param {string} background */
            const check = (fill, stroke, opacity, background) => {
                const region = render(view).querySelector(
                    '[data-name="legend_region_right"]'
                );
                const symbols = region.querySelector(
                    '[data-name="symbols"] [data-mark-type="point"]'
                );
                expect(symbols.getAttribute("fill")).toBe(fill);
                expect(symbols.getAttribute("stroke")).toBe(stroke);
                expect(symbols.getAttribute("fill-opacity")).toBe(opacity);
                expect(
                    region
                        .querySelector(
                            '[data-name="title"] [data-mark-type="text"]'
                        )
                        .getAttribute("fill")
                ).toBe(stroke);
                expect(
                    region
                        .querySelector(
                            '[data-name="labels"] [data-mark-type="text"]'
                        )
                        .getAttribute("fill")
                ).toBe(stroke);
                expect(
                    region
                        .querySelector(
                            '[data-name="background"] [data-mark-type="rect"]'
                        )
                        .getAttribute("fill")
                ).toBe(background);
            };
            check(collected ? "red" : "blue", "blue", "0.5", "pink");
            if (collected) {
                source.paramRuntime.setValue("palette", {
                    foreground: "orange",
                    opacity: 0.2,
                    background: "white",
                });
            }
            definition.paramRuntime.setValue("palette", {
                foreground: "green",
                opacity: 0.8,
                background: "yellow",
            });
            await view.paramRuntime.whenPropagated();
            check(collected ? "orange" : "green", "green", "0.8", "yellow");
        } finally {
            view.disposeSubtree();
        }
    }
);

test.each([false, true])(
    "point size legends inherit reactive fill and stroke with encoding=%s",
    async (encoding) => {
        const { view } = await createView({
            config: { legend: { disable: false } },
            vconcat: [
                {
                    name: "aSource",
                    params: [
                        {
                            name: "palette",
                            value: { fill: "red", stroke: "blue" },
                        },
                    ],
                    data: { values: [{ size: 1 }, { size: 4 }] },
                    mark: {
                        type: "point",
                        filled: true,
                        ...(!encoding
                            ? {
                                  fill: { expr: "palette.fill" },
                                  stroke: { expr: "palette.stroke" },
                              }
                            : {}),
                    },
                    encoding: {
                        size: { field: "size", type: "quantitative" },
                        ...(encoding
                            ? {
                                  fill: { value: { expr: "palette.fill" } },
                                  stroke: { value: { expr: "palette.stroke" } },
                              }
                            : {}),
                    },
                },
            ],
        });
        try {
            const source = view
                .getDescendants()
                .find((child) => child.name === "aSource");
            /** @param {string} fill @param {string} stroke */
            const check = (fill, stroke) => {
                const symbols = render(view).querySelector(
                    '[data-name="symbols"] [data-mark-type="point"]'
                );
                expect(symbols.getAttribute("fill")).toBe(fill);
                expect(symbols.getAttribute("stroke")).toBe(stroke);
            };
            check("red", "blue");
            source.paramRuntime.setValue("palette", {
                fill: "white",
                stroke: "yellow",
            });
            await view.paramRuntime.whenPropagated();
            check("white", "yellow");
        } finally {
            view.disposeSubtree();
        }
    }
);

test("gradient legend outlines and text follow palette updates while the ramp keeps its data colors", async () => {
    const { view } = await createView({
        config: {
            legend: {
                disable: false,
                labelColor: { expr: "palette.foreground" },
                titleColor: { expr: "palette.foreground" },
            },
        },
        vconcat: [
            {
                name: "aSource",
                params: [{ name: "palette", value: { foreground: "blue" } }],
                data: { values: [{ value: 0 }, { value: 10 }] },
                mark: "point",
                encoding: {
                    color: {
                        field: "value",
                        type: "quantitative",
                        scale: { range: ["red", "yellow"] },
                        legend: {
                            gradientStrokeColor: { expr: "palette.foreground" },
                            gradientStrokeWidth: 2,
                        },
                    },
                },
            },
        ],
    });
    try {
        const initial = render(view);
        const initialStops = Array.from(
            initial.querySelectorAll("linearGradient stop"),
            (stop) => stop.getAttribute("stop-color")
        );
        const source = view
            .getDescendants()
            .find((child) => child.name === "aSource");
        source.paramRuntime.setValue("palette", { foreground: "white" });
        await view.paramRuntime.whenPropagated();
        const changed = render(view);
        expect(
            initial
                .querySelector(
                    '[data-name="gradientBorder"] [data-mark-type="rect"]'
                )
                .getAttribute("stroke")
        ).toBe("blue");
        expect(
            changed
                .querySelector(
                    '[data-name="gradientBorder"] [data-mark-type="rect"]'
                )
                .getAttribute("stroke")
        ).toBe("white");
        for (const name of ["title", "gradientLabels"]) {
            expect(
                changed
                    .querySelector(
                        `[data-name="${name}"] [data-mark-type="text"]`
                    )
                    .getAttribute("fill")
            ).toBe("white");
        }
        expect(
            Array.from(
                changed.querySelectorAll("linearGradient stop"),
                (stop) => stop.getAttribute("stop-color")
            )
        ).toEqual(initialStops);
    } finally {
        view.disposeSubtree();
    }
});
