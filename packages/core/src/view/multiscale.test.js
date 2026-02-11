import { describe, expect, test } from "vitest";
import { isMultiscaleSpec, normalizeMultiscaleSpec } from "./multiscale.js";

/**
 * @param {import("../spec/mark.js").MarkType} mark
 * @returns {import("../spec/view.js").UnitSpec}
 */
function unit(mark) {
    return { mark };
}

/**
 * @param {import("../spec/view.js").LayerSpec | import("../spec/view.js").UnitSpec | import("../spec/view.js").MultiscaleSpec | import("../spec/view.js").ImportSpec} child
 * @returns {import("../spec/view.js").LayerSpec}
 */
function asLayer(child) {
    return /** @type {import("../spec/view.js").LayerSpec} */ (child);
}

describe("multiscale", () => {
    test("isMultiscaleSpec detects multiscale specs", () => {
        expect(isMultiscaleSpec({ multiscale: [] })).toBe(true);
        expect(isMultiscaleSpec({ layer: [] })).toBe(false);
    });

    test("normalizes shorthand stops to generated layer wrappers", () => {
        const first = unit("point");
        const second = unit("rect");
        const third = unit("rule");

        const normalized = normalizeMultiscaleSpec({
            multiscale: [first, second, third],
            stops: [20000, 2000],
        });

        expect(normalized.layer).toHaveLength(3);
        expect(asLayer(normalized.layer[0]).layer[0]).toBe(first);
        expect(asLayer(normalized.layer[1]).layer[0]).toBe(second);
        expect(asLayer(normalized.layer[2]).layer[0]).toBe(third);

        expect(asLayer(normalized.layer[0]).opacity).toEqual({
            channel: "auto",
            unitsPerPixel: [30000, 10000],
            values: [1, 0],
        });
        expect(asLayer(normalized.layer[1]).opacity).toEqual({
            channel: "auto",
            unitsPerPixel: [30000, 10000, 3000, 1000],
            values: [0, 1, 1, 0],
        });
        expect(asLayer(normalized.layer[2]).opacity).toEqual({
            channel: "auto",
            unitsPerPixel: [3000, 1000],
            values: [0, 1],
        });
    });

    test("supports object stops with explicit channel and fade", () => {
        const normalized = normalizeMultiscaleSpec({
            multiscale: [unit("point"), unit("rect")],
            stops: {
                metric: "unitsPerPixel",
                channel: "x",
                values: [1000],
                fade: 0.1,
            },
        });

        expect(asLayer(normalized.layer[0]).opacity).toEqual({
            channel: "x",
            unitsPerPixel: [1100, 900],
            values: [1, 0],
        });
        expect(asLayer(normalized.layer[1]).opacity).toEqual({
            channel: "x",
            unitsPerPixel: [1100, 900],
            values: [0, 1],
        });
    });

    test("supports mixed constants and ExprRefs in top-level stops", () => {
        const normalized = normalizeMultiscaleSpec({
            multiscale: [unit("point"), unit("rect"), unit("rule")],
            stops: [5000, { expr: "windowSize / max(width, 1)" }],
        });

        const firstOpacity =
            /** @type {import("../spec/view.js").DynamicOpacity} */ (
                asLayer(normalized.layer[0]).opacity
            );
        const secondOpacity =
            /** @type {import("../spec/view.js").DynamicOpacity} */ (
                asLayer(normalized.layer[1]).opacity
            );

        expect(firstOpacity.unitsPerPixel).toEqual([7500, 2500]);
        expect(secondOpacity.unitsPerPixel).toEqual([
            7500,
            2500,
            { expr: "(windowSize / max(width, 1)) * 1.5" },
            { expr: "(windowSize / max(width, 1)) * 0.5" },
        ]);
    });

    test("supports top-level array of ExprRefs for stops", () => {
        const normalized = normalizeMultiscaleSpec({
            multiscale: [unit("point"), unit("rect"), unit("rule")],
            stops: [{ expr: "outerStop" }, { expr: "innerStop" }],
        });

        const middleOpacity =
            /** @type {import("../spec/view.js").DynamicOpacity} */ (
                asLayer(normalized.layer[1]).opacity
            );
        expect(middleOpacity.unitsPerPixel).toEqual([
            { expr: "(outerStop) * 1.5" },
            { expr: "(outerStop) * 0.5" },
            { expr: "(innerStop) * 1.5" },
            { expr: "(innerStop) * 0.5" },
        ]);
    });

    test("supports mixed constants and ExprRefs in object stop values", () => {
        const normalized = normalizeMultiscaleSpec({
            multiscale: [unit("point"), unit("rect"), unit("rule")],
            stops: {
                metric: "unitsPerPixel",
                values: [6000, { expr: "innerStop" }],
            },
        });

        const middleOpacity =
            /** @type {import("../spec/view.js").DynamicOpacity} */ (
                asLayer(normalized.layer[1]).opacity
            );
        expect(middleOpacity.unitsPerPixel).toEqual([
            9000,
            3000,
            { expr: "(innerStop) * 1.5" },
            { expr: "(innerStop) * 0.5" },
        ]);
    });

    test("fails if top-level ExprRef stop array has invalid length", () => {
        expect(() =>
            normalizeMultiscaleSpec({
                multiscale: [unit("point"), unit("rect"), unit("rule")],
                stops: [{ expr: "onlyOneStop" }],
            })
        ).toThrow("Invalid stop count");
    });

    test("fails if top-level stops is a single ExprRef", () => {
        const invalidStops = /** @type {any} */ ({ expr: "[1000]" });

        expect(() =>
            normalizeMultiscaleSpec({
                multiscale: [unit("point"), unit("rect")],
                stops: invalidStops,
            })
        ).toThrow('"stops.values" must be an array of numbers or ExprRefs.');
    });

    test("keeps a single level as a plain child", () => {
        const child = unit("point");
        const normalized = normalizeMultiscaleSpec({
            multiscale: [child],
            stops: [],
        });

        expect(normalized.layer).toEqual([child]);
    });

    test("fails on mismatching stop and stage count", () => {
        expect(() =>
            normalizeMultiscaleSpec({
                multiscale: [unit("point"), unit("rect"), unit("rule")],
                stops: [1000],
            })
        ).toThrow("Invalid stop count");
    });

    test("fails on overlapping transitions", () => {
        expect(() =>
            normalizeMultiscaleSpec({
                multiscale: [unit("point"), unit("rect"), unit("rule")],
                stops: {
                    metric: "unitsPerPixel",
                    values: [10, 9],
                    fade: 0.15,
                },
            })
        ).toThrow("Adjacent transitions overlap");
    });
});
