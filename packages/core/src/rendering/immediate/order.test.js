import { describe, expect, it, vi } from "vitest";
import { partitionOrderData } from "./order.js";

describe("partitionOrderData", () => {
    it("keeps candidate ranges and partition order", () => {
        /** @type {{id: number}[]} */
        const data = [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }];
        const [nonmatching, matching] = /** @type {{id: number}[][]} */ (
            partitionOrderData(
                data,
                1,
                4,
                (datum) => /** @type {{id: number}} */ (datum).id === 2,
                ["nonmatching", "matching"]
            )
        );

        expect(nonmatching.map((datum) => datum.id)).toEqual([1, 3]);
        expect(matching.map((datum) => datum.id)).toEqual([2]);
    });

    it("evaluates the predicate once for all requested passes", () => {
        const predicate = vi.fn((datum) => datum.id === 2);
        const data = [{ id: 1 }, { id: 2 }];
        partitionOrderData(data, 0, data.length, predicate, [
            "nonmatching",
            "matching",
        ]);
        expect(predicate).toHaveBeenCalledTimes(data.length);
    });
});
