import { describe, expect, test } from "vitest";
import { InternMap } from "internmap";
import { getSvgData } from "./markData.js";

/**
 * @param {Map<any, object[]> | InternMap<any, object[]>} facetBatches
 */
function createMark(facetBatches) {
    return /** @type {import("../marks/mark.js").default} */ (
        /** @type {unknown} */ ({
            unitView: {
                getCollector: () => ({ facetBatches }),
                getPathString: () => "root/mark",
            },
        })
    );
}

describe("SVG mark data", () => {
    test("repeats non-faceted data for a sample facet", () => {
        const data = [{ value: 1 }];
        const mark = createMark(new Map([[undefined, data]]));

        expect(getSvgData(mark, { facetId: ["sample-1"] })).toBe(data);
    });

    test("uses sample-faceted data when the non-faceted batch is empty", () => {
        const data = [{ value: 2 }];
        const mark = createMark(
            new InternMap(
                [
                    [undefined, []],
                    [["sample-1"], data],
                ],
                JSON.stringify
            )
        );

        expect(getSvgData(mark, { facetId: ["sample-1"] })).toBe(data);
    });
});
