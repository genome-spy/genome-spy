import { describe, expect, it, vi } from "vitest";

import ConcatView from "../concatView.js";
import UnitView from "../unitView.js";
import SelectionRect, { INTERVAL_DRAG_ACTIVE_PARAM } from "./selectionRect.js";
import { createTestViewContext } from "../testUtils.js";
import { buildDataFlow } from "../flowBuilder.js";
import { optimizeDataFlow } from "../../data/flowOptimizer.js";
import { syncFlowHandles } from "../../data/flowInit.js";

describe("SelectionRect", () => {
    it("uses static overlay data and parameter-backed expressions", () => {
        const context = createTestViewContext();
        const parent = new ConcatView(
            { hconcat: [] },
            context,
            null,
            null,
            "p"
        );

        /** @type {import("../../spec/view.js").UnitSpec} */
        const unitSpec = {
            data: { values: [{ x: 0, y: 0 }] },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
            },
        };

        const unitView = new UnitView(unitSpec, context, parent, parent, "u");

        /** @type {import("../../types/selectionTypes.js").IntervalSelection} */
        let selection = {
            type: "interval",
            intervals: { x: [0, 1], y: [2, 3] },
        };

        /** @type {(listener: () => void) => () => void} */
        const subscribe = vi.fn((listener) => {
            /** @returns {void} */
            function unsubscribe() {}

            return unsubscribe;
        });
        /** @type {() => void} */
        const invalidate = () => undefined;

        /** @returns {import("../../types/selectionTypes.js").IntervalSelection} */
        const getSelection = () => selection;

        /** @type {import("../../paramRuntime/types.js").ExprRefFunction} */
        const selectionExpr = Object.assign(getSelection, {
            subscribe,
            invalidate,
            identifier: () => "selection",
            fields: [],
            globals: [],
            code: "selection",
        });

        const gridChild = /** @type {import("./gridChild.js").default} */ (
            /** @type {unknown} */ ({
                layoutParent: parent,
                view: unitView,
            })
        );

        const selectionRect = new SelectionRect(gridChild, selectionExpr);
        expect(selectionRect.spec.data).toEqual({ values: [{}] });
        expect(selectionRect.spec.encoding).toMatchObject({
            x: { datum: { expr: "selection.intervals.x[0]" } },
            x2: { datum: { expr: "selection.intervals.x[1]" } },
            y: { datum: { expr: "selection.intervals.y[0]" } },
            y2: { datum: { expr: "selection.intervals.y[1]" } },
        });
        expect(subscribe).not.toHaveBeenCalled();

        const flow = buildDataFlow(selectionRect, context.dataFlow);
        syncFlowHandles(selectionRect, optimizeDataFlow(flow));

        const dataSource =
            /** @type {import("../../data/sources/inlineSource.js").default} */ (
                selectionRect.flowHandle?.dataSource
            );
        expect(dataSource).toBeDefined();
        selection = {
            type: "interval",
            intervals: { x: [5, 6], y: [7, 8] },
        };

        expect(dataSource.params.values).toEqual([{}]);
    });

    it("marks the view as domain inert", () => {
        const context = createTestViewContext();
        const parent = new ConcatView(
            { hconcat: [] },
            context,
            null,
            null,
            "p"
        );

        /** @type {import("../../spec/view.js").UnitSpec} */
        const unitSpec = {
            data: { values: [{ x: 0, y: 0 }] },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
            },
        };

        const unitView = new UnitView(unitSpec, context, parent, parent, "u");

        /** @type {(listener: () => void) => () => void} */
        const subscribe = () => () => undefined;
        /** @type {() => void} */
        const invalidate = () => undefined;

        const selectionExpr = Object.assign(
            () => ({ intervals: { x: [0, 1], y: [2, 3] } }),
            {
                subscribe,
                invalidate,
                identifier: () => "selection",
                fields: [],
                globals: [],
                code: "selection",
            }
        );

        // Use a real unit view so SelectionRect can resolve scales if needed.
        const gridChild = /** @type {import("./gridChild.js").default} */ (
            /** @type {unknown} */ ({
                layoutParent: parent,
                view: unitView,
            })
        );

        const selectionRect = new SelectionRect(gridChild, selectionExpr);
        expect(selectionRect.isDomainInert()).toBe(true);
    });

    it("exposes brush zindex for GridView ordering", () => {
        const context = createTestViewContext();
        const parent = new ConcatView(
            { hconcat: [] },
            context,
            null,
            null,
            "p"
        );

        /** @type {import("../../spec/view.js").UnitSpec} */
        const unitSpec = {
            data: { values: [{ x: 0, y: 0 }] },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
            },
        };

        const unitView = new UnitView(unitSpec, context, parent, parent, "u");

        /** @type {(listener: () => void) => () => void} */
        const subscribe = () => () => undefined;
        /** @type {() => void} */
        const invalidate = () => undefined;

        const selectionExpr = Object.assign(
            () => ({ intervals: { x: [0, 1], y: [2, 3] } }),
            {
                subscribe,
                invalidate,
                identifier: () => "selection",
                fields: [],
                globals: [],
                code: "selection",
            }
        );

        const gridChild = /** @type {import("./gridChild.js").default} */ (
            /** @type {unknown} */ ({
                layoutParent: parent,
                view: unitView,
            })
        );

        const selectionRect = new SelectionRect(gridChild, selectionExpr, {
            zindex: 7,
        });

        expect(selectionRect.getZindex()).toBe(7);
    });

    it("declares a default cursor ExprRef backed by the drag param", () => {
        const context = createTestViewContext();
        const parent = new ConcatView(
            { hconcat: [] },
            context,
            null,
            null,
            "p"
        );

        /** @type {import("../../spec/view.js").UnitSpec} */
        const unitSpec = {
            data: { values: [{ x: 0, y: 0 }] },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
            },
        };

        const unitView = new UnitView(unitSpec, context, parent, parent, "u");

        /** @type {import("../../paramRuntime/types.js").ExprRefFunction} */
        const selectionExpr = Object.assign(
            () => ({ intervals: { x: [0, 1], y: [2, 3] } }),
            {
                subscribe: () => /** @returns {void} */ () => undefined,
                invalidate: /** @returns {void} */ () => undefined,
                identifier: () => "selection",
                fields: [],
                globals: [],
                code: "selection",
            }
        );

        const gridChild = /** @type {import("./gridChild.js").default} */ (
            /** @type {unknown} */ ({
                layoutParent: parent,
                view: unitView,
            })
        );

        const selectionRect = new SelectionRect(gridChild, selectionExpr);
        const rectLayer = /** @type {any} */ (selectionRect.spec.layer[0]);

        expect(selectionRect.spec.params).toEqual([
            { name: INTERVAL_DRAG_ACTIVE_PARAM, value: false },
        ]);
        expect(rectLayer.mark.cursor).toEqual({
            expr: `${INTERVAL_DRAG_ACTIVE_PARAM} ? 'grabbing' : 'move'`,
        });
    });

    it("preserves a custom brush cursor when provided", () => {
        const context = createTestViewContext();
        const parent = new ConcatView(
            { hconcat: [] },
            context,
            null,
            null,
            "p"
        );

        /** @type {import("../../spec/view.js").UnitSpec} */
        const unitSpec = {
            data: { values: [{ x: 0, y: 0 }] },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
            },
        };

        const unitView = new UnitView(unitSpec, context, parent, parent, "u");

        /** @type {import("../../paramRuntime/types.js").ExprRefFunction} */
        const selectionExpr = Object.assign(
            () => ({ intervals: { x: [0, 1], y: [2, 3] } }),
            {
                subscribe: () => /** @returns {void} */ () => undefined,
                invalidate: /** @returns {void} */ () => undefined,
                identifier: () => "selection",
                fields: [],
                globals: [],
                code: "selection",
            }
        );

        const gridChild = /** @type {import("./gridChild.js").default} */ (
            /** @type {unknown} */ ({
                layoutParent: parent,
                view: unitView,
            })
        );

        const selectionRect = new SelectionRect(gridChild, selectionExpr, {
            cursor: { expr: "'copy'" },
        });
        const rectLayer = /** @type {any} */ (selectionRect.spec.layer[0]);

        expect(rectLayer.mark.cursor).toEqual({ expr: "'copy'" });
    });
});
