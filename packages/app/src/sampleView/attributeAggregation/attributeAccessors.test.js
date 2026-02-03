import { describe, expect, test } from "vitest";
import { InternMap } from "internmap";

import ParamMediator from "@genome-spy/core/view/paramMediator.js";
import { createAccessor } from "@genome-spy/core/encoder/accessor.js";

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
});
