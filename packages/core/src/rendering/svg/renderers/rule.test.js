// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../../../genomeSpy/headlessBootstrap.js";
import { createSinglePointSelection } from "../../../selection/selection.js";
import { createSvg } from "../index.js";

describe("SVG rule renderer", () => {
    test("preserves the endpoint of a long diagonal rule with a border", async () => {
        const { view } = await createHeadlessEngine({
            padding: 0,
            data: { values: [{}] },
            mark: {
                type: "rule",
                size: 4,
                fill: "red",
                stroke: "blue",
                strokeWidth: 2,
            },
            encoding: {
                x: { value: 0.05 },
                x2: { value: 0.95 },
                y: { value: 0.9 },
                y2: { value: 0.4 },
            },
        });
        try {
            const { svg } = createSvg({
                viewRoot: view,
                logicalWidth: 2000,
                logicalHeight: 2000,
                background: null,
            });
            const paints = svg.querySelector('[data-mark-type="rule"] > g');
            const [x, y, degrees] = paints
                .getAttribute("transform")
                .match(/-?\d+(?:\.\d+)?/g)
                .map(Number);
            const length = Number(
                paints
                    .querySelector("path")
                    .getAttribute("d")
                    .match(/H([\d.]+)/)[1]
            );
            const radians = (degrees * Math.PI) / 180;

            // Angular rounding accumulates into visible endpoint drift on long rules.
            expect(
                Math.hypot(
                    x + length * Math.cos(radians) - 1900,
                    y + length * Math.sin(radians) - 1200
                )
            ).toBeLessThan(0.1);
        } finally {
            view.disposeSubtree();
        }
    });

    test("uses shared paint channels and filled color routing for vector rule borders", async () => {
        const { view } = await createHeadlessEngine({
            params: [{ name: "ink", value: "blue" }],
            data: { values: [{ width: 3 }] },
            mark: {
                type: "rule",
                filled: false,
                color: { expr: "ink" },
                size: 4,
                strokeCap: "round",
                strokeDash: [0, 8],
            },
            encoding: {
                x: { value: 0.1 },
                x2: { value: 0.9 },
                y: { value: 0.5 },
                strokeWidth: {
                    field: "width",
                    type: "quantitative",
                    scale: null,
                    legend: null,
                },
            },
        });
        const render = () =>
            createSvg({
                viewRoot: view,
                logicalWidth: 100,
                logicalHeight: 100,
                background: null,
            }).svg;
        try {
            const svg = render();
            const border = svg.querySelector(
                '[data-mark-type="rule"] path[mask]'
            );
            expect(border?.getAttribute("stroke")).toBe("blue");
            expect(border?.getAttribute("stroke-width")).toBe("6");
            expect(border?.getAttribute("d")).toContain("A2 2"); // Zero-on round dashes remain circles.
            expect(svg.querySelector("mask path")?.getAttribute("fill")).toBe(
                "black"
            );
            expect(svg.querySelector("image, filter")).toBeNull();
            view.paramRuntime.setValue("ink", "rgba(0,0,255,0)");
            await view.paramRuntime.whenPropagated();
            expect(
                render().querySelector('[data-mark-type="rule"] path[mask]')
            ).toBeNull();
        } finally {
            view.disposeSubtree();
        }
    });

    test("expands short rules to their expression-valued minimum length", async () => {
        const { view } = await createHeadlessEngine({
            params: [{ name: "minimum", value: 10 }],
            data: { values: [{}] },
            mark: {
                type: "rule",
                minLength: { expr: "minimum" },
                strokeCap: "square",
            },
            encoding: {
                x: { value: 0.49 },
                x2: { value: 0.51 },
                y: { value: 0.5 },
                y2: { value: 0.5 },
                color: { value: "black" },
                size: { value: 2 },
            },
        });

        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const line = svg.querySelector('[data-mark-type="rule"] line');

        expect(line?.getAttribute("x1")).toBe("45");
        expect(line?.getAttribute("x2")).toBe("55");
        expect(line?.getAttribute("y1")).toBe("50");
        expect(line?.getAttribute("y2")).toBe("50");
    });
    test.each(/** @type {const} */ (["color", "fill"]))(
        "keeps shared %s scales, legends and selection colors",
        async (channel) => {
            const { view } = await createHeadlessEngine({
                data: { values: [{ category: "A" }, { category: "B" }] },
                params: [
                    {
                        name: "picked",
                        select: { type: "point", toggle: false },
                    },
                ],
                config: {
                    legend: {
                        disable: false,
                        labelColor: "black",
                        titleColor: "black",
                    },
                },
                resolve: {
                    scale: { [channel]: "shared" },
                    legend: { [channel]: "shared" },
                },
                encoding: {
                    [channel]: {
                        field: "category",
                        type: "nominal",
                        scale: { domain: ["A", "B"], range: ["red", "blue"] },
                        condition: {
                            param: "picked",
                            empty: false,
                            value: "black",
                        },
                    },
                },
                vconcat: [
                    {
                        name: "rules",
                        mark: "rule",
                        encoding: { x: { value: 0.25 } },
                    },
                    {
                        name: "points",
                        mark: "point",
                        encoding: { x: { value: 0.75 } },
                    },
                ],
            });
            try {
                const rules =
                    /** @type {import("../../../view/unitView.js").default} */ (
                        view
                            .getDescendants()
                            .find((child) => child.name == "rules")
                    );
                const points =
                    /** @type {import("../../../view/unitView.js").default} */ (
                        view
                            .getDescendants()
                            .find((child) => child.name == "points")
                    );
                expect(rules.getScaleResolution(channel)).toBe(
                    points.getScaleResolution(channel)
                );
                const render = () =>
                    createSvg({
                        viewRoot: view,
                        logicalWidth: 100,
                        logicalHeight: 100,
                        background: null,
                    }).svg;
                const strokes = (/** @type {SVGSVGElement} */ svg) =>
                    Array.from(
                        svg.querySelectorAll('[data-mark-type="rule"] line')
                    ).map((line) => line.getAttribute("stroke"));
                const initial = render();
                expect(strokes(initial)).toEqual(["red", "blue"]);
                expect(
                    Array.from(
                        initial.querySelectorAll("text"),
                        (text) => text.textContent
                    )
                ).toEqual(expect.arrayContaining(["A", "B"]));
                expect(rules.getScaleResolution(channel).getDomain()).toEqual([
                    "A",
                    "B",
                ]);
                const [datum] = rules.getCollector().getData();
                view.paramRuntime.setValue(
                    "picked",
                    createSinglePointSelection(datum)
                );
                await view.paramRuntime.whenPropagated();
                expect(strokes(render())).toEqual(["black", "blue"]);
                expect(rules.getScaleResolution(channel).getDomain()).toEqual([
                    "A",
                    "B",
                ]);
            } finally {
                view.disposeSubtree();
            }
        }
    );
    test.each([undefined, "purple"])(
        "size symbols follow explicit fill with legend override %s",
        async (symbolStrokeColor) => {
            const { view } = await createHeadlessEngine({
                params: [{ name: "paint", value: "red" }],
                config: {
                    legend: {
                        disable: false,
                        labelColor: "black",
                        titleColor: "black",
                    },
                },
                vconcat: [
                    {
                        name: "rules",
                        data: { values: [{ width: 1 }, { width: 2 }] },
                        mark: {
                            type: "rule",
                            color: "blue",
                            fill: { expr: "paint" },
                        },
                        encoding: {
                            x: { value: 0.5 },
                            color: { value: "cyan" },
                            size: {
                                field: "width",
                                type: "quantitative",
                                scale: { domain: [1, 2], range: [2, 5] },
                                legend: { symbolStrokeColor },
                            },
                        },
                    },
                ],
            });
            try {
                for (const paint of ["red", "orange"]) {
                    view.paramRuntime.setValue("paint", paint);
                    await view.paramRuntime.whenPropagated();
                    const { svg, warnings } = createSvg({
                        viewRoot: view,
                        logicalWidth: 200,
                        logicalHeight: 150,
                        background: null,
                    });
                    const rules = svg.querySelector(
                        '[data-name="rules"] [data-mark-type="rule"]'
                    );
                    const symbols = svg.querySelector(
                        '[data-name="symbols"] [data-mark-type="rule"]'
                    );
                    expect(rules.getAttribute("stroke")).toBe(paint);
                    expect(symbols.getAttribute("stroke")).toBe(
                        symbolStrokeColor ?? paint
                    );
                    expect(
                        symbols.querySelectorAll("line").length
                    ).toBeGreaterThan(0);
                    expect(warnings).toEqual([]);
                }
            } finally {
                view.disposeSubtree();
            }
        }
    );
});
