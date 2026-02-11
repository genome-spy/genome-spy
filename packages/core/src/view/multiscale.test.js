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

    test("supports top-level ExprRef shorthand for stops", () => {
        const normalized = normalizeMultiscaleSpec({
            multiscale: [unit("point"), unit("rect")],
            stops: {
                expr: "[windowSize / max(width, 1)]",
            },
        });

        const firstUnitsPerPixel = asLayer(normalized.layer[0]).opacity
            .unitsPerPixel;
        const secondUnitsPerPixel = asLayer(normalized.layer[1]).opacity
            .unitsPerPixel;

        expect(firstUnitsPerPixel).toEqual({
            expr: expect.stringContaining("windowSize / max(width, 1)"),
        });
        expect(secondUnitsPerPixel).toEqual({
            expr: expect.stringContaining("windowSize / max(width, 1)"),
        });
    });

    test("supports top-level array of ExprRefs for stops", () => {
        const normalized = normalizeMultiscaleSpec({
            multiscale: [unit("point"), unit("rect"), unit("rule")],
            stops: [{ expr: "outerStop" }, { expr: "innerStop" }],
        });

        const middleOpacity = asLayer(normalized.layer[1]).opacity;
        expect(middleOpacity.unitsPerPixel).toEqual({
            expr: expect.stringContaining("outerStop"),
        });
        expect(middleOpacity.unitsPerPixel).toEqual({
            expr: expect.stringContaining("innerStop"),
        });
    });

    test("fails if top-level ExprRef stop array has invalid length", () => {
        expect(() =>
            normalizeMultiscaleSpec({
                multiscale: [unit("point"), unit("rect"), unit("rule")],
                stops: [{ expr: "onlyOneStop" }],
            })
        ).toThrow("Invalid stop count");
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
