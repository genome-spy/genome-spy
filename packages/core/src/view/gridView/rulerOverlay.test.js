import { describe, expect, test } from "vitest";
import {
    createRulerOverlaySpec,
    resolveRulerDisplay,
    resolveRulerOverlayExtent,
} from "./rulerOverlay.js";

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
                    fillOpacity: 0.15,
                    strokeWidth: 1,
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

describe("resolveRulerOverlayExtent", () => {
    test("keeps explicit view extent per-view", () => {
        expect(
            resolveRulerOverlayExtent({
                paramName: "cursor",
                config: { extent: "view" },
                ownerSpec: { vconcat: [] },
                channels: ["x"],
                isAligned: () => true,
            })
        ).toBe("view");
    });

    test("uses container extent for aligned concat rulers", () => {
        expect(
            resolveRulerOverlayExtent({
                paramName: "cursor",
                config: { extent: "auto" },
                ownerSpec: { vconcat: [] },
                channels: ["x"],
                isAligned: () => true,
            })
        ).toBe("container");

        expect(
            resolveRulerOverlayExtent({
                paramName: "cursor",
                config: { extent: "container" },
                ownerSpec: { hconcat: [] },
                channels: ["y"],
                isAligned: () => true,
            })
        ).toBe("container");
    });

    test("falls back to per-view for auto when projections differ", () => {
        expect(
            resolveRulerOverlayExtent({
                paramName: "cursor",
                config: { extent: "auto" },
                ownerSpec: { vconcat: [] },
                channels: ["x"],
                isAligned: () => false,
            })
        ).toBe("view");
    });

    test("rejects forced container extent when projections differ", () => {
        expect(() =>
            resolveRulerOverlayExtent({
                paramName: "cursor",
                config: { extent: "container" },
                ownerSpec: { vconcat: [] },
                channels: ["x"],
                isAligned: () => false,
            })
        ).toThrow(
            'Ruler param "cursor" cannot use extent "container" because its x projections do not align.'
        );
    });

    test("rejects forced container extent for unsupported concat direction", () => {
        expect(() =>
            resolveRulerOverlayExtent({
                paramName: "cursor",
                config: { extent: "container" },
                ownerSpec: { hconcat: [] },
                channels: ["x"],
                isAligned: () => true,
            })
        ).toThrow(
            'Ruler param "cursor" cannot use extent "container" for channel "x" in this view.'
        );
    });
});
