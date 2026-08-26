import { describe, expect, test, vi } from "vitest";
import { InternMap } from "internmap";

import PlacementSource from "../../view/layout/placementSource.js";
import { getPackedMarkData, getPackedMarkRange } from "./webGpuMarkData.js";

describe("WebGPU mark data", () => {
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
