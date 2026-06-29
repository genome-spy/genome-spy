import { describe, expect, test } from "vitest";
import { INTERVAL_DRAG_ACTIVE_PARAM } from "./selectionRect.js";
import { createSelectionRectSpec } from "./selectionRectSpec.js";

describe("createSelectionRectSpec", () => {
    test("builds the dynamic-source selection rectangle spec", () => {
        const spec = createSelectionRectSpec({
            gridChild: /** @type {any} */ ({
                view: {
                    getScaleResolution: () => ({ type: "linear" }),
                },
            }),
            selection: {
                type: "interval",
                intervals: { x: [0, 1], y: [2, 3] },
            },
            brushConfig: {},
        });

        expect(spec.data).toEqual({
            values: [{ _x: 0, _x2: 1, _y: 2, _y2: 3 }],
        });
        expect(spec.params).toEqual([
            { name: INTERVAL_DRAG_ACTIVE_PARAM, value: false },
        ]);
        expect(spec.layer[0].mark.cursor).toEqual({
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
            selection: {
                type: "interval",
                intervals: { x: [0, 1], y: [2, 3] },
            },
            brushConfig: {
                cursor: { expr: "'copy'" },
                measure: "inside",
            },
        });

        expect(spec.layer[0].mark.cursor).toEqual({ expr: "'copy'" });
        expect(spec.layer[1].encoding.text).toEqual({
            expr: "format(datum._x2 - datum._x, '.3s') + 'b'",
        });
    });
});
