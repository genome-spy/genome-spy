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
            unitsPerPixel: [23000, 17000],
            values: [1, 0],
        });
        expect(asLayer(normalized.layer[1]).opacity).toEqual({
            channel: "auto",
            unitsPerPixel: [23000, 17000, 2300, 1700],
            values: [0, 1, 1, 0],
        });
        expect(asLayer(normalized.layer[2]).opacity).toEqual({
            channel: "auto",
            unitsPerPixel: [2300, 1700],
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
