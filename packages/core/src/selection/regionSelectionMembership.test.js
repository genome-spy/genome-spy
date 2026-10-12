import { expect, test } from "vitest";
import { createPendingRegionSelection } from "./regionSelection.js";
import { iterateRegionSelectionMembership } from "./regionSelectionMembership.js";
/** @type {import("../types/selectionTypes.js").RegionSelectionIntent} */
const intent = {
    polygon: [
        [0, 0],
        [1, 0],
        [0, 1],
    ],
    fields: { x: "x", y: "y" },
    scales: {
        x: { type: "linear", domain: [0, 1], range: [0, 1], clamp: false },
        y: { type: "linear", domain: [0, 1], range: [0, 1], clamp: false },
    },
    producer: { scope: [], view: "points" },
};
test("readback membership rejects mismatched rows, duplicate IDs and invalid indices", () => {
    const selection = createPendingRegionSelection(intent);
    const rows = [{ __uniqueId: 7 }, { __uniqueId: 9 }];
    for (const [ids, indices] of [
        [[7], [2]],
        [[9], [0]],
        [
            [7, 7],
            [0, 0],
        ],
        [[7], []],
    ]) {
        const scan = iterateRegionSelectionMembership(selection, rows, {
            ids: new Uint32Array(ids),
            indices: new Uint32Array(indices),
        });
        expect(() => scan.next()).toThrow(/region|Region/);
    }
    const scan = iterateRegionSelectionMembership(selection, rows, {
        ids: new Uint32Array([9, 7]),
        indices: new Uint32Array([1, 0]),
    });
    const result = scan.next();
    if (!result.done) throw new Error("Expected completed membership.");
    expect(Array.from(result.value.data.values())).toEqual([rows[1], rows[0]]);
    expect(selection.data.size).toBe(0);
});
