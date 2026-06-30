import { describe, expect, test } from "vitest";
import createFunction from "../../utils/expression.js";
import { INTERVAL_DRAG_ACTIVE_PARAM } from "./selectionRect.js";
import { createSelectionRectSpec } from "./selectionRectSpec.js";

describe("createSelectionRectSpec", () => {
    test("builds the expression-backed selection rectangle spec", () => {
        const spec = createSelectionRectSpec({
            gridChild: /** @type {any} */ ({
                view: {
                    getScaleResolution: () => ({ type: "linear" }),
                },
            }),
            selectionExpression: "brush",
            selection: {
                type: "interval",
                intervals: { x: [0, 1], y: [2, 3] },
            },
            brushConfig: {},
        });

        expect(spec.data).toEqual({ values: [{}] });
        expect(spec.transform).toEqual([
            {
                type: "filter",
                expr: "brush.type === 'interval' && brush.intervals.x != null && brush.intervals.y != null",
            },
        ]);
        expect(spec.encoding).toMatchObject({
            x: {
                datum: {
                    expr: "(brush.intervals.x != null ? brush.intervals.x[0] : 0)",
                },
            },
            x2: {
                datum: {
                    expr: "(brush.intervals.x != null ? brush.intervals.x[1] : 0)",
                },
            },
            y: {
                datum: {
                    expr: "(brush.intervals.y != null ? brush.intervals.y[0] : 0)",
                },
            },
            y2: {
                datum: {
                    expr: "(brush.intervals.y != null ? brush.intervals.y[1] : 0)",
                },
            },
        });
        expect(spec.params).toEqual([
            { name: INTERVAL_DRAG_ACTIVE_PARAM, value: false },
        ]);
        const rectLayer = /** @type {any} */ (spec.layer[0]);
        expect(rectLayer.mark.cursor).toEqual({
            expr: `${INTERVAL_DRAG_ACTIVE_PARAM} ? 'grabbing' : 'move'`,
        });
    });

    test("preserves custom cursor and measurement label expressions", () => {
        const spec = createSelectionRectSpec({
            gridChild: /** @type {any} */ ({
                view: {
                    getScaleResolution: () => ({ type: "locus" }),
                },
            }),
            selectionExpression: "brush",
            selection: {
                type: "interval",
                intervals: { x: [0, 1], y: [2, 3] },
            },
            brushConfig: {
                cursor: { expr: "'copy'" },
                measure: "inside",
            },
        });

        const rectLayer = /** @type {any} */ (spec.layer[0]);
        const textLayer = /** @type {any} */ (spec.layer[1]);
        expect(rectLayer.mark.cursor).toEqual({ expr: "'copy'" });
        expect(textLayer.encoding.text).toEqual({
            expr: "format(brush.intervals.x[1] - brush.intervals.x[0], '.3s') + 'b'",
        });
    });

    test("bound expressions tolerate inactive interval selections", () => {
        const inactiveSelection =
            /** @type {import("../../types/selectionTypes.js").IntervalSelection} */ ({
                type: "interval",
                intervals: { x: null },
            });
        const spec = createSelectionRectSpec({
            gridChild: /** @type {any} */ ({
                view: {
                    getScaleResolution: () => ({ type: "linear" }),
                },
            }),
            selectionExpression: "brush",
            selection: inactiveSelection,
            brushConfig: {},
        });

        const globalObject = {
            brush: inactiveSelection,
        };

        const x = /** @type {any} */ (spec.encoding.x);
        const x2 = /** @type {any} */ (spec.encoding.x2);

        // Datum ExprRefs become mark uniforms and are evaluated before the
        // filter transform can hide the empty overlay row.
        expect(createFunction(x.datum.expr, globalObject)()).toBe(0);
        expect(createFunction(x2.datum.expr, globalObject)()).toBe(0);
    });
});
