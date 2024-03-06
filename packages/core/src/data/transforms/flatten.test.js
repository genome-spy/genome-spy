import { describe, expect, test } from "vitest";
import { processData } from "../flowTestUtils.js";
import FlattenTransform from "./flatten.js";

/**
 * @param {import("../../spec/transform.js").FlattenParams} params
 * @param {any[]} data
 */
function transform(params, data) {
    return processData(new FlattenTransform(params), data);
}

describe("Flatten transform", () => {
    /**
     * @typedef {import("../../spec/transform.js").FlattenParams} FlattenParams
     */
    test("With a single field", () => {
        /** @type {FlattenParams} */
        const params = { type: "flatten", fields: ["foo"] };

        const input = [
            { name: "alpha", data: 123, foo: [1, 2] },
            { name: "beta", data: 456, foo: [3, 4, 5] },
        ];

        expect(transform(params, input)).toEqual([
            { name: "alpha", data: 123, foo: 1 },
            { name: "alpha", data: 123, foo: 2 },
            { name: "beta", data: 456, foo: 3 },
            { name: "beta", data: 456, foo: 4 },
            { name: "beta", data: 456, foo: 5 },
        ]);
    });

    test("With an index field", () => {
        /** @type {FlattenParams} */
        const params = { type: "flatten", fields: ["foo"], index: "idx" };

        const input = [
            { name: "alpha", data: 123, foo: [1, 2] },
            { name: "beta", data: 456, foo: [3, 4, 5] },
        ];

        expect(transform(params, input)).toEqual([
            { name: "alpha", data: 123, foo: 1, idx: 0 },
            { name: "alpha", data: 123, foo: 2, idx: 1 },
            { name: "beta", data: 456, foo: 3, idx: 0 },
            { name: "beta", data: 456, foo: 4, idx: 1 },
            { name: "beta", data: 456, foo: 5, idx: 2 },
        ]);
    });

    test("With multiple fields", () => {
        /** @type {FlattenParams} */
        const params = { type: "flatten", fields: ["foo", "bar"] };

        const input = [
            { key: "alpha", foo: [1, 2], bar: ["A", "B"] },
            { key: "beta", foo: [3, 4, 5], bar: ["C", "D"] },
        ];

        expect(transform(params, input)).toEqual([
            { key: "alpha", foo: 1, bar: "A" },
            { key: "alpha", foo: 2, bar: "B" },
            { key: "beta", foo: 3, bar: "C" },
            { key: "beta", foo: 4, bar: "D" },
            { key: "beta", foo: 5, bar: null },
        ]);
    });

    test("Throws on mismatching spec lengths", () => {
        /** @type {FlattenParams} */
        const params = {
            type: "flatten",
            fields: ["a", "b"],
            as: ["a"],
        };

        expect(() => transform(params, [])).toThrow();
    });

    test("Missing fields property treats the input object as an array", () => {
        /** @type {FlattenParams} */
        const params = {
            type: "flatten",
        };

        const input = [[{ a: 1 }], [{ a: 2 }, { a: 3 }]];

        expect(transform(params, input)).toEqual([
            { a: 1 },
            { a: 2 },
            { a: 3 },
        ]);
    });
});
