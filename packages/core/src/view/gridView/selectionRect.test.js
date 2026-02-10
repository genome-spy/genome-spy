import { describe, expect, it, vi } from "vitest";

import ConcatView from "../concatView.js";
import UnitView from "../unitView.js";
import SelectionRect from "./selectionRect.js";
import { createTestViewContext } from "../testUtils.js";
import { buildDataFlow } from "../flowBuilder.js";
import { optimizeDataFlow } from "../../data/flowOptimizer.js";
import { syncFlowHandles } from "../../data/flowInit.js";

describe("SelectionRect", () => {
    it("uses flow handles for dynamic data updates", () => {
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

        let selection = {
            intervals: { x: [0, 1], y: [2, 3] },
        };

        /** @type {(listener: () => void) => () => void} */
        const subscribe = () => () => undefined;
        /** @type {() => void} */
        const invalidate = () => undefined;

        /** @type {import("../../paramRuntime/types.js").ExprRefFunction} */
        const selectionExpr = Object.assign(() => selection, {
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

        const flow = buildDataFlow(selectionRect, context.dataFlow);
        syncFlowHandles(selectionRect, optimizeDataFlow(flow));

        const dataSource =
            /** @type {import("../../data/sources/inlineSource.js").default} */ (
                selectionRect.flowHandle?.dataSource
            );
        expect(dataSource).toBeDefined();

        // Selection updates should push new interval data to the inline source.
        const updateSpy = vi.spyOn(dataSource, "updateDynamicData");
        selection = {
            intervals: { x: [5, 6], y: [7, 8] },
        };

        selectionRect._selectionListener();

        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledWith([
            { _x: 5, _x2: 6, _y: 7, _y2: 8 },
        ]);
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
});
