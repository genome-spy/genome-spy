import { expect, test } from "vitest";
import { processData } from "../flowTestUtils.js";
import FlattenSequenceTransform from "./flattenSequence.js";

/**
 * @param {import("../../spec/transform.js").FlattenSequenceParams} params
 * @param {any[]} data
 */
function transform(params, data) {
    return processData(new FlattenSequenceTransform(params), data);
}

test("FlattenSequenece", () => {
    expect(
        transform(
            {
                type: "flattenSequence",
                field: "seq",
                as: ["p", "seq"],
            },
            [
                { identifier: "A", seq: "TCG" },
                { identifier: "B", seq: "AAT" },
            ]
        )
    ).toEqual([
        { identifier: "A", seq: "T", p: 0 },
        { identifier: "A", seq: "C", p: 1 },
        { identifier: "A", seq: "G", p: 2 },
        { identifier: "B", seq: "A", p: 0 },
        { identifier: "B", seq: "A", p: 1 },
        { identifier: "B", seq: "T", p: 2 },
    ]);
});
