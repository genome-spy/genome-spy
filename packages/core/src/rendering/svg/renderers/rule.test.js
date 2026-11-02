// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../../../genomeSpy/headlessBootstrap.js";
import { createSinglePointSelection } from "../../../selection/selection.js";
import { createSvg } from "../index.js";

describe("SVG rule renderer", () => {
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
});
