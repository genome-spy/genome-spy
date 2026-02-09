import { describe, expect, test } from "vitest";
import { InternMap } from "internmap";

import ParamMediator from "@genome-spy/core/paramRuntime/viewParamRuntime.js";
import { createAccessor } from "@genome-spy/core/encoder/accessor.js";
import { createIntervalSelection } from "@genome-spy/core/selection/selection.js";

import { createViewAttributeAccessor } from "./attributeAccessors.js";

/**
 * @param {object} options
 * @param {Array<{ pos: number, value: number }>} options.data
 * @param {import("@genome-spy/core/types/encoder.js").Accessor} options.xAccessor
 * @param {import("@genome-spy/core/types/encoder.js").Accessor} options.x2Accessor
 * @param {string} [options.hitTestMode]
 */
function createView({
    data,
    xAccessor,
    x2Accessor,
    hitTestMode = "intersects",
    root,
}) {
    // InternMap mirrors Collector's key normalization for facet ids.
    const facetBatches = new InternMap([], JSON.stringify);
    facetBatches.set(["sample-1"], data);
    const collector = { facetBatches };

    return {
        getEncoding: () => ({ x: { type: "quantitative" } }),
        getScaleResolution: () => ({ getScale: () => ({ type: "linear" }) }),
        getCollector: () => collector,
        getDataAccessor: (channel) => {
            if (channel === "x") {
                return xAccessor;
            } else if (channel === "x2") {
                return x2Accessor;
            }
        },
        getLayoutAncestors: () => (root ? [root] : []),
        mark: { defaultHitTestMode: hitTestMode },
    };
}

describe("createViewAttributeAccessor", () => {
    test("treats equal x and x2 accessors as point features", () => {
        const paramMediator = new ParamMediator(() => undefined);
        const xAccessor = createAccessor("x", { field: "pos" }, paramMediator);
        const x2Accessor = createAccessor(
            "x2",
            { field: "pos" },
            paramMediator
        );
        const view = createView({
            data: [{ pos: 5, value: 10 }],
            xAccessor,
            x2Accessor,
        });

        const accessor = createViewAttributeAccessor(view, {
            view: "test",
            field: "value",
            interval: [5, 5],
            aggregation: { op: "weightedMean" },
        });

        expect(accessor("sample-1")).toBe(10);
    });

    test("resolves selection-backed intervals via param selector", () => {
        const rootParamMediator = new ParamMediator(() => undefined);
        const setBrush = rootParamMediator.registerParam({
            name: "brush",
            select: { type: "interval", encodings: ["x"] },
        });
        const brush = createIntervalSelection(["x"]);
        brush.intervals.x = [4, 6];
        setBrush(brush);

        const root = {
            paramRuntime: rootParamMediator,
            visit: (visitor) => visitor(root),
        };

        const paramMediator = new ParamMediator(() => undefined);
        const xAccessor = createAccessor("x", { field: "pos" }, paramMediator);
        const x2Accessor = createAccessor(
            "x2",
            { field: "pos" },
            paramMediator
        );

        const view = createView({
            data: [
                { pos: 4, value: 10 },
                { pos: 7, value: 20 },
            ],
            xAccessor,
            x2Accessor,
            root,
        });

        const accessor = createViewAttributeAccessor(view, {
            view: "test",
            field: "value",
            interval: {
                type: "selection",
                selector: { scope: [], param: "brush" },
            },
            aggregation: { op: "count" },
        });

        expect(accessor("sample-1")).toBe(1);
    });

    test("throws on accessor call for selection-backed intervals when selection is empty", () => {
        const rootParamMediator = new ParamMediator(() => undefined);
        rootParamMediator.registerParam({
            name: "brush",
            select: { type: "interval", encodings: ["x"] },
        });

        const root = {
            paramRuntime: rootParamMediator,
            visit: (visitor) => visitor(root),
        };

        const paramMediator = new ParamMediator(() => undefined);
        const xAccessor = createAccessor("x", { field: "pos" }, paramMediator);
        const x2Accessor = createAccessor(
            "x2",
            { field: "pos" },
            paramMediator
        );

        const view = createView({
            data: [{ pos: 4, value: 10 }],
            xAccessor,
            x2Accessor,
            root,
        });

        const accessor = createViewAttributeAccessor(view, {
            view: "test",
            field: "value",
            interval: {
                type: "selection",
                selector: { scope: [], param: "brush" },
            },
            aggregation: { op: "count" },
        });

        expect(() => accessor("sample-1")).toThrow("is empty");
    });
});
