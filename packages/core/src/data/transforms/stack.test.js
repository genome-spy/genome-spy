import { describe, expect, test } from "vitest";
import { processData } from "../flowTestUtils.js";
import StackTransform from "./stack.js";
import Collector from "../collector.js";
import CloneTransform from "./clone.js";

const sampleData = [
    { group: "a", choice: "q", value: 1 },
    { group: "b", choice: "x", value: 1 },
    { group: "b", choice: "y", value: 3 },
];

test("stack isolates facets while sorting rows from multiple physical files", () => {
    const stack = new StackTransform({
        type: "stack",
        field: "value",
        groupby: [],
        sort: { field: "value" },
    });
    const clone = new CloneTransform();
    const output = new Collector();
    stack.addChild(clone);
    clone.addChild(output);

    stack.beginBatch({ type: "facet", facetId: ["A"] });
    stack.beginBatch({ type: "file", url: "first" });
    stack.handle({ value: 3 });
    stack.beginBatch({ type: "file", url: "second" });
    stack.handle({ value: 1, extra: 9 });
    stack.beginBatch({ type: "facet", facetId: ["B"] });
    stack.handle({ value: 10 });
    stack.complete();

    expect(output.facetBatches.get(["A"])).toEqual([
        { value: 1, extra: 9, y0: 0, y1: 1 },
        { value: 3, y0: 1, y1: 4 },
    ]);
    expect(output.facetBatches.get(["B"])).toEqual([
        { value: 10, y0: 0, y1: 10 },
    ]);
});

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

    test("Compound groups use comma-joined values in first-seen order", () => {
        /** @type {{ a: string | null | undefined, b: string | number }[]} */
        const data = [
            { a: "x,y", b: "z" },
            { a: null, b: 1 },
            { a: "x", b: "y,z" },
            { a: undefined, b: "1" },
        ];

        expect(transform({ type: "stack", groupby: ["a", "b"] }, data)).toEqual(
            [
                { a: "x,y", b: "z", y0: 0, y1: 1 },
                { a: "x", b: "y,z", y0: 1, y1: 2 },
                { a: null, b: 1, y0: 0, y1: 1 },
                { a: undefined, b: "1", y0: 1, y1: 2 },
            ]
        );
    });

    test("Single-field groups keep string coercion and empty nullish keys", () => {
        /** @type {{ group: string | number | null | undefined }[]} */
        const data = [
            { group: null },
            { group: 1 },
            { group: undefined },
            { group: "1" },
        ];

        expect(transform({ type: "stack", groupby: ["group"] }, data)).toEqual([
            { group: null, y0: 0, y1: 1 },
            { group: undefined, y0: 1, y1: 2 },
            { group: 1, y0: 0, y1: 1 },
            { group: "1", y0: 1, y1: 2 },
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
