import { describe, expect, test, vi } from "vitest";
import { InternMap } from "internmap";

import PlacementSource from "../../view/layout/placementSource.js";
import { getPackedMarkData, getPackedMarkRange } from "./webGpuMarkData.js";

/** @param {number} value */
function constantEncoder(value) {
    return Object.assign(() => value, {
        branches: [],
        channelDef: { value },
        constant: true,
    });
}

/** @param {any} scale */
function createXEncoder(scale) {
    const accessor = Object.assign(
        (/** @type {{x: number}} */ datum) => datum.x,
        {
            asNumberAccessor() {
                return accessor;
            },
            channel: "x",
            channelDef: { field: "x" },
            constant: false,
            fields: ["x"],
        }
    );
    return Object.assign(
        (/** @type {{x: number}} */ datum) => scale(accessor(datum)),
        {
            branches: [{ accessor, predicate: () => true }],
            channelDef: { field: "x", buildIndex: true },
            constant: false,
            scale,
        }
    );
}

/** @param {Map<any, object[]> | InternMap<any, object[]>} facetBatches */
function createIndexedMark(facetBatches) {
    const scale = Object.assign((/** @type {number} */ value) => value, {
        type: "linear",
        domain: () => [0, 100],
        range: () => [0, 1],
    });
    const collector = { dataRevision: 0, facetBatches };
    const scaleResolution = {
        getAxisLength: () => 100,
        getScale: () => scale,
        zoomExtent: [0, 100],
    };
    const mark = /** @type {any} */ ({
        encoders: {
            size: constantEncoder(0),
            strokeWidth: constantEncoder(0),
            x: createXEncoder(scale),
        },
        getType: () => "point",
        properties: { minPickingSize: 0 },
        unitView: {
            getCollector: () => collector,
            getPathString: () => "test",
            getScaleResolution: () => scaleResolution,
            paramRuntime: { evaluateAndGet: vi.fn() },
        },
    });
    return { collector, mark, scale, scaleResolution };
}

describe("WebGPU mark data", () => {
    test("indexes nonzero packed facet ranges", () => {
        const firstFacet = ["first"];
        const secondFacet = ["second"];
        const firstData = [{ x: 10 }, { x: 20 }];
        const secondData = [{ x: 70 }, { x: 80 }];
        const fixture = createIndexedMark(
            new InternMap(
                [
                    [firstFacet, firstData],
                    [secondFacet, secondData],
                ],
                JSON.stringify
            )
        );
        const source = new PlacementSource();
        source.replaceTopology([firstFacet, secondFacet], new Float32Array(8));

        const packed = getPackedMarkData(fixture.mark, source);
        const secondRange = getPackedMarkRange(
            fixture.mark,
            { placement: { source, index: 1 } },
            packed
        );
        const target = /** @type {[number, number]} */ ([0, 0]);

        expect(secondRange).toMatchObject({
            firstInstance: 2,
            instanceCount: 2,
        });
        secondRange.xIndex(65, 75, target);
        expect(target[0]).toBeGreaterThanOrEqual(2);
        expect(target[1]).toBeLessThanOrEqual(4);
    });

    test("rebuilds packed x indexes when encoder identity changes", () => {
        const data = [{ x: 10 }, { x: 20 }];
        const fixture = createIndexedMark(new Map([[undefined, data]]));
        const first = getPackedMarkData(fixture.mark);

        fixture.mark.encoders.x = createXEncoder(fixture.scale);
        const second = getPackedMarkData(fixture.mark);

        expect(second).not.toBe(first);
        expect(second.ranges.get(data)?.xIndex).toBeDefined();
    });

    test("rebuilds packed x indexes when the index domain changes", () => {
        const data = [{ x: 10 }, { x: 20 }];
        const fixture = createIndexedMark(new Map([[undefined, data]]));
        const first = getPackedMarkData(fixture.mark);

        fixture.scaleResolution.zoomExtent = [0, 200];
        const second = getPackedMarkData(fixture.mark);

        expect(second).not.toBe(first);
        expect(second.xIndexSpec.indexDomain).toEqual([0, 200]);
        expect(getPackedMarkData(fixture.mark)).toBe(second);
    });

    test("packs complete topology independently of active occurrences", () => {
        const firstFacet = ["first"];
        const hiddenFacet = ["hidden"];
        const lastFacet = ["last"];
        const firstData = [{ x: 1 }];
        const lastData = [{ x: 2 }, { x: 3 }];
        const collector = {
            dataRevision: 4,
            facetBatches: new InternMap(
                [
                    [undefined, []],
                    [firstFacet, firstData],
                    [lastFacet, lastData],
                ],
                JSON.stringify
            ),
        };
        const mark = /** @type {any} */ ({
            unitView: {
                getCollector: () => collector,
                getPathString: () => "test",
            },
        });
        const source = new PlacementSource();
        source.replaceTopology(
            [firstFacet, hiddenFacet, lastFacet],
            new Float32Array(12)
        );

        const packed = getPackedMarkData(mark, source);
        expect(packed.data).toEqual([...firstData, ...lastData]);
        const facetLookup = vi.spyOn(collector.facetBatches, "get");
        facetLookup.mockClear();
        expect(
            getPackedMarkRange(
                mark,
                { placement: { source, index: 1 } },
                packed
            )
        ).toEqual({ firstInstance: 1, instanceCount: 0 });
        expect(
            getPackedMarkRange(
                mark,
                { placement: { source, index: 2 } },
                packed
            )
        ).toEqual({ firstInstance: 1, instanceCount: 2 });
        expect(getPackedMarkData(mark, source)).toBe(packed);
        expect(facetLookup).not.toHaveBeenCalled();
    });

    test("packs facet batches larger than the function argument limit", () => {
        const facetId = ["large"];
        const batch = Array.from({ length: 200_000 }, (_, index) => ({
            index,
        }));
        const collector = {
            dataRevision: 1,
            facetBatches: new InternMap([[facetId, batch]], JSON.stringify),
        };
        const mark = /** @type {any} */ ({
            unitView: { getCollector: () => collector },
        });
        const source = new PlacementSource();
        source.replaceTopology([facetId], new Float32Array(4));

        const packed = getPackedMarkData(mark, source);

        expect(packed.data).toHaveLength(batch.length);
        expect(packed.data[0]).toBe(batch[0]);
        expect(packed.data.at(-1)).toBe(batch.at(-1));
        expect(packed.placementRanges).toEqual([
            { firstInstance: 0, instanceCount: batch.length },
        ]);
    });
});
