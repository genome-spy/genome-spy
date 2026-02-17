// @ts-check
import { describe, expect, it } from "vitest";
import { InternMap } from "internmap";
import { createDatumAtAccessor } from "./datumLookup.js";

const createDatumAtAccessorAny = /** @type {any} */ (createDatumAtAccessor);

describe("createDatumAtAccessor", () => {
    /**
     * @param {import("@genome-spy/core/data/flowNode.js").Datum[]} data
     * @param {object} [options]
     */
    const makeViewStub = (data, options = {}) => ({
        getDataAccessor: (channel) => options[`${channel}Accessor`],
        getScaleResolution: () => ({
            getScale: () => ({ type: options.scaleType }),
        }),
        getCollector: () => ({
            facetBatches: new InternMap(
                [[[options.sampleId], data]],
                JSON.stringify
            ),
        }),
    });

    it("finds discrete values by equality", () => {
        const data = [{ x: "a" }, { x: "b" }];
        const view = makeViewStub(data, {
            xAccessor: (d) => d.x,
            scaleType: "ordinal",
            sampleId: "s1",
        });
        const datumAt = createDatumAtAccessorAny(view);

        expect(datumAt("s1", "b")).toEqual({ x: "b" });
    });

    it("finds continuous ranges by overlap", () => {
        const data = [
            { x: 0, x2: 10, value: 1 },
            { x: 10, x2: 20, value: 2 },
        ];
        const view = makeViewStub(data, {
            xAccessor: (d) => d.x,
            x2Accessor: (d) => d.x2,
            scaleType: "linear",
            sampleId: "s1",
        });
        const datumAt = createDatumAtAccessorAny(view);

        expect(datumAt("s1", 15)).toEqual({ x: 10, x2: 20, value: 2 });
    });

    it("falls back to equality when x2 is missing", () => {
        const data = [{ x: 5, value: 7 }];
        const view = makeViewStub(data, {
            xAccessor: (d) => d.x,
            scaleType: "linear",
            sampleId: "s1",
        });
        const datumAt = createDatumAtAccessorAny(view);

        expect(datumAt("s1", 5)).toEqual({ x: 5, value: 7 });
    });
});
