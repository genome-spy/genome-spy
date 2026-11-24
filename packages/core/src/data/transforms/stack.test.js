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

test.each(/** @type {const} */ (["zero", "diverging"]))(
    "%s stacks isolate facets and sort rows across file boundaries",
    (offset) => {
        const stack = new StackTransform({
            type: "stack",
            field: "value",
            groupby: [],
            sort: { field: "value" },
            offset,
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
    }
);

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

    test("groups by whole tuples in first-seen order and sorts within each group", () => {
        const rows = transform(
            { ...baseParams, groupby: ["group", "subgroup"] },
            [
                { group: "a,b", subgroup: "c", item: "first late", value: 4 },
                { group: "a", subgroup: "b,c", item: "second", value: 3 },
                { group: "a,b", subgroup: "d", item: "third", value: 5 },
                { group: "a,b", subgroup: "c", item: "first early", value: 2 },
            ]
        );

        expect(rows.map(({ item, z0, z1 }) => [item, z0, z1])).toEqual([
            ["first early", 0, 2],
            ["first late", 2, 6],
            ["second", 0, 3],
            ["third", 0, 5],
        ]);
    });

    test("groups equal dates together while keeping date, number, and string keys distinct", () => {
        const time = Date.UTC(2025, 0, 1);
        const rows = transform(baseParams, [
            { group: new Date(time), value: 2 },
            { group: time, value: 4 },
            { group: String(time), value: 5 },
            { group: new Date(time), value: 3 },
            { group: new Date(time + 1), value: 6 },
        ]);

        expect(rows.map(({ value, z0, z1 }) => [value, z0, z1])).toEqual([
            [2, 0, 2],
            [3, 2, 5],
            [4, 0, 4],
            [5, 0, 5],
            [6, 0, 6],
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

    test("diverging offset stacks each sign separately and anchors zero at the baseline", () => {
        const rows = transform(
            { ...baseParams, offset: "diverging", sort: undefined },
            [
                { group: "a", value: 2 },
                { group: "a", value: -4 },
                { group: "a", value: 0 },
                { group: "a", value: -1 },
                { group: "a", value: 3 },
                { group: "b", value: -2 },
            ]
        );

        expect(rows.map(({ value, z0, z1 }) => [value, z0, z1])).toEqual([
            [2, 0, 2],
            [-4, -4, 0],
            [0, 0, 0],
            [-1, -5, -4],
            [3, 2, 5],
            [-2, -2, 0],
        ]);
    });

    test("diverging stacks keep invalid values missing", () => {
        const rows = transform(
            { ...baseParams, offset: "diverging", sort: undefined },
            [
                { group: "a", value: Infinity },
                { group: "a", value: NaN },
                { group: "a", value: null },
                { group: "a", value: 2n },
                { group: "a", value: "3" },
                { group: "a", value: 2 },
                { group: "a", value: -Infinity },
                { group: "a", value: -3 },
            ]
        );

        expect(rows.map(({ z0, z1 }) => [z0, z1])).toEqual([
            [NaN, NaN],
            [NaN, NaN],
            [NaN, NaN],
            [NaN, NaN],
            [NaN, NaN],
            [0, 2],
            [NaN, NaN],
            [-3, 0],
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
