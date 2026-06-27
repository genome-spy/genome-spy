import { describe, expect, test } from "vitest";
import { createRulerOverlaySpec, resolveRulerDisplay } from "./rulerOverlay.js";

describe("createRulerOverlaySpec", () => {
    test("creates an x ruler overlay with a static source and param filter", () => {
        const spec = createRulerOverlaySpec({
            paramName: "cursor",
            channels: ["x"],
            mark: {
                stroke: "red",
                strokeWidth: 2,
            },
        });

        expect(spec).toMatchObject({
            name: "rulerOverlay_cursor",
            domainInert: true,
            resolve: {
                scale: {
                    x: "forced",
                    y: "forced",
                },
                axis: {
                    x: "excluded",
                    y: "excluded",
                },
            },
            data: { values: [{}] },
            transform: [
                {
                    type: "filter",
                    expr: "cursor.type === 'ruler' && cursor.values.x != null",
                },
            ],
            encoding: {
                x: {
                    datum: {
                        expr: "linearize('x', cursor.values.x)",
                    },
                    axis: null,
                    type: null,
                    title: null,
                },
            },
            layer: [
                {
                    name: "rulerOverlayRuleX",
                    mark: {
                        type: "rule",
                        clip: true,
                        stroke: "red",
                        strokeWidth: 2,
                    },
                },
            ],
        });
    });

    test("creates a crosshair overlay with both channel guards", () => {
        const spec = createRulerOverlaySpec({
            paramName: "crosshair",
            channels: ["x", "y"],
        });

        expect(spec.transform).toEqual([
            {
                type: "filter",
                expr: "crosshair.type === 'ruler' && crosshair.values.x != null && crosshair.values.y != null",
            },
        ]);
        expect(spec.encoding).toMatchObject({
            x: {
                datum: {
                    expr: "linearize('x', crosshair.values.x)",
                },
                axis: null,
                type: null,
                title: null,
            },
            y: {
                datum: {
                    expr: "linearize('y', crosshair.values.y)",
                },
                axis: null,
                type: null,
                title: null,
            },
        });
        expect(spec.layer.map((layer) => layer.name)).toEqual([
            "rulerOverlayRuleX",
            "rulerOverlayRuleY",
        ]);
    });

    test("creates centered rule positions", () => {
        const spec = createRulerOverlaySpec({
            paramName: "cursor",
            channels: ["x"],
            display: "center",
        });

        expect(/** @type {any} */ (spec.encoding.x).expr).toBe(undefined);
        expect(/** @type {any} */ (spec.encoding.x).datum.expr).toBe(
            "linearize('x', cursor.values.x) + 0.5"
        );
        expect(/** @type {any} */ (spec.layer[0]).mark.type).toBe("rule");
    });

    test("creates band rectangle bounds", () => {
        const spec = createRulerOverlaySpec({
            paramName: "cursor",
            channels: ["x"],
            display: "band",
        });

        expect(spec.encoding).toMatchObject({
            x: {
                datum: {
                    expr: "linearize('x', cursor.values.x)",
                },
                axis: null,
                type: null,
                title: null,
            },
            x2: {
                datum: {
                    expr: "linearize('x', cursor.values.x) + 1",
                },
                axis: null,
                type: null,
                title: null,
            },
        });
        expect(spec.layer).toMatchObject([
            {
                name: "rulerOverlayBand",
                mark: {
                    type: "rect",
                    clip: true,
                },
            },
        ]);
    });
});

describe("resolveRulerDisplay", () => {
    test("uses explicit display", () => {
        expect(resolveRulerDisplay("linear", "auto", "band")).toBe("band");
    });

    test("defaults snapped index and locus rulers to center display", () => {
        expect(resolveRulerDisplay("index", "auto")).toBe("center");
        expect(resolveRulerDisplay("locus", "integer")).toBe("center");
    });

    test("defaults quantitative and unsnapped rulers to line display", () => {
        expect(resolveRulerDisplay("linear", "auto")).toBe("line");
        expect(resolveRulerDisplay("index", false)).toBe("line");
    });
});
