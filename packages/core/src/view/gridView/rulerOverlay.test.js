import { describe, expect, test } from "vitest";
import { createRulerOverlaySpec } from "./rulerOverlay.js";

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
                    expr: "linearize('x', cursor.values.x)",
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
                expr: "linearize('x', crosshair.values.x)",
                type: null,
                title: null,
            },
            y: {
                expr: "linearize('y', crosshair.values.y)",
                type: null,
                title: null,
            },
        });
        expect(spec.layer.map((layer) => layer.name)).toEqual([
            "rulerOverlayRuleX",
            "rulerOverlayRuleY",
        ]);
    });
});
