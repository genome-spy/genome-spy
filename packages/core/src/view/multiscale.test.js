import { describe, expect, test } from "vitest";
import { isMultiscaleSpec, normalizeMultiscaleSpec } from "./multiscale.js";

describe("multiscale", () => {
    test("isMultiscaleSpec detects multiscale specs", () => {
        expect(isMultiscaleSpec({ multiscale: [] })).toBe(true);
        expect(isMultiscaleSpec({ layer: [] })).toBe(false);
    });

    test("normalizes shorthand stops to generated layer wrappers", () => {
        const first = { mark: "point" };
        const second = { mark: "rect" };
        const third = { mark: "rule" };

        const normalized = normalizeMultiscaleSpec({
            multiscale: [first, second, third],
            stops: [20000, 2000],
        });

        expect(normalized.layer).toHaveLength(3);
        expect(normalized.layer[0].layer[0]).toBe(first);
        expect(normalized.layer[1].layer[0]).toBe(second);
        expect(normalized.layer[2].layer[0]).toBe(third);

        expect(normalized.layer[0].opacity).toEqual({
            channel: "auto",
            unitsPerPixel: [23000, 17000],
            values: [1, 0],
        });
        expect(normalized.layer[1].opacity).toEqual({
            channel: "auto",
            unitsPerPixel: [23000, 17000, 2300, 1700],
            values: [0, 1, 1, 0],
        });
        expect(normalized.layer[2].opacity).toEqual({
            channel: "auto",
            unitsPerPixel: [2300, 1700],
            values: [0, 1],
        });
    });

    test("supports object stops with explicit channel and fade", () => {
        const normalized = normalizeMultiscaleSpec({
            multiscale: [{ mark: "point" }, { mark: "rect" }],
            stops: {
                metric: "unitsPerPixel",
                channel: "x",
                values: [1000],
                fade: 0.1,
            },
        });

        expect(normalized.layer[0].opacity).toEqual({
            channel: "x",
            unitsPerPixel: [1100, 900],
            values: [1, 0],
        });
        expect(normalized.layer[1].opacity).toEqual({
            channel: "x",
            unitsPerPixel: [1100, 900],
            values: [0, 1],
        });
    });

    test("keeps a single level as a plain child", () => {
        const child = { mark: "point" };
        const normalized = normalizeMultiscaleSpec({
            multiscale: [child],
            stops: [],
        });

        expect(normalized.layer).toEqual([child]);
    });

    test("fails on mismatching stop and stage count", () => {
        expect(() =>
            normalizeMultiscaleSpec({
                multiscale: [
                    { mark: "point" },
                    { mark: "rect" },
                    { mark: "rule" },
                ],
                stops: [1000],
            })
        ).toThrow("Invalid stop count");
    });

    test("fails on overlapping transitions", () => {
        expect(() =>
            normalizeMultiscaleSpec({
                multiscale: [
                    { mark: "point" },
                    { mark: "rect" },
                    { mark: "rule" },
                ],
                stops: {
                    metric: "unitsPerPixel",
                    values: [10, 9],
                    fade: 0.15,
                },
            })
        ).toThrow("Adjacent transitions overlap");
    });
});
