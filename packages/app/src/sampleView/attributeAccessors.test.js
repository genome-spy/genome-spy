import { describe, expect, it } from "vitest";
import { InternMap } from "internmap";
import { createViewAttributeAccessor } from "./attributeAccessors.js";

describe("createViewAttributeAccessor", () => {
    /**
     * @param {import("@genome-spy/core/data/flowNode.js").Datum[]} data
     * @param {object} options
     */
    const makeViewStub = (data, options) => ({
        getDataAccessor: (channel) => options[`${channel}Accessor`],
        getScaleResolution: () => ({
            getScale: () => ({ type: options.scaleType ?? "linear" }),
        }),
        getCollector: () => ({
            facetBatches: new InternMap(
                [[[options.sampleId], data]],
                JSON.stringify
            ),
        }),
    });

    it("aggregates over interval for ranged features", () => {
        const data = [
            { x: 0, x2: 5, value: 2 },
            { x: 5, x2: 10, value: 4 },
        ];
        const view = makeViewStub(data, {
            sampleId: "s1",
            xAccessor: (d) => d.x,
            x2Accessor: (d) => d.x2,
        });
        const accessor = createViewAttributeAccessor(view, {
            view: "track",
            field: "value",
            interval: [2, 8],
            aggregation: { op: "weightedMean" },
        });

        expect(accessor("s1")).toBe(3);
    });

    it("counts point features within interval", () => {
        const data = [
            { x: 1, value: 5 },
            { x: 7, value: 3 },
        ];
        const view = makeViewStub(data, {
            sampleId: "s1",
            xAccessor: (d) => d.x,
        });
        const accessor = createViewAttributeAccessor(view, {
            view: "track",
            field: "value",
            interval: [0, 5],
            aggregation: { op: "count" },
        });

        expect(accessor("s1")).toBe(1);
    });
});
