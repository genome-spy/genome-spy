import { describe, expect, test } from "vitest";
import { processData } from "../flowTestUtils.js";
import StackTransform from "./stack.js";

const sampleData = [
    { group: "a", choice: "q", value: 1 },
    { group: "b", choice: "x", value: 1 },
    { group: "b", choice: "y", value: 3 },
];

/** @type {import("../../spec/transform.js").StackParams} */
const baseParams = {
    type: "stack",
    field: "value",
    groupby: ["group"],
    sort: {
        field: "value",
        order: "ascending",
    },
    offset: "zero",
    as: ["z0", "z1"],
};

/**
 *
 * @param {import("../../spec/transform.js").StackParams} params
 * @param {any[]} data
 */
function transform(params, data) {
    return processData(new StackTransform(params), data);
}

describe("Stack transform", () => {
    test("No field", () => {
        const conf = Object.assign({}, baseParams, {
            field: undefined,
        });

        expect(transform(conf, sampleData)).toEqual([
            { group: "a", choice: "q", value: 1, z0: 0, z1: 1 },
            { group: "b", choice: "x", value: 1, z0: 0, z1: 1 },
            { group: "b", choice: "y", value: 3, z0: 1, z1: 2 },
        ]);
    });

    test("Zero offset", () => {
        expect(transform(baseParams, sampleData)).toEqual([
            { group: "a", choice: "q", value: 1, z0: 0, z1: 1 },
            { group: "b", choice: "x", value: 1, z0: 0, z1: 1 },
            { group: "b", choice: "y", value: 3, z0: 1, z1: 4 },
        ]);
    });

    test("Normalize offset", () => {
        const conf = Object.assign({}, baseParams, {
            offset: "normalize",
        });

        expect(transform(conf, sampleData)).toEqual([
            { group: "a", choice: "q", value: 1, z0: 0, z1: 1 },
            { group: "b", choice: "x", value: 1, z0: 0, z1: 0.25 },
            { group: "b", choice: "y", value: 3, z0: 0.25, z1: 1 },
        ]);
    });

    test("Center offset", () => {
        const conf = Object.assign({}, baseParams, {
            offset: "center",
        });

        expect(transform(conf, sampleData)).toEqual([
            { group: "a", choice: "q", value: 1, z0: -0.5, z1: 0.5 },
            { group: "b", choice: "x", value: 1, z0: -2, z1: -1 },
            { group: "b", choice: "y", value: 3, z0: -1, z1: 2 },
        ]);
    });

    test("Descending sort", () => {
        const conf = Object.assign({}, baseParams, {
            sort: {
                field: "value",
                order: "descending",
            },
        });
        expect(transform(conf, sampleData)).toEqual([
            { group: "a", choice: "q", value: 1, z0: 0, z1: 1 },
            { group: "b", choice: "y", value: 3, z0: 0, z1: 3 },
            { group: "b", choice: "x", value: 1, z0: 3, z1: 4 },
        ]);
    });
});
