import { describe, expect, test } from "vitest";
import { processData } from "../flowTestUtils.js";
import AggregateTransform from "./aggregate.js";

/**
 * @param {import("../../spec/transform.js").AggregateParams} params
 * @param {any[]} data
 */
function transform(params, data) {
    return processData(new AggregateTransform(params), data);
}

describe("Aggregate transform", () => {
    test("Default to count when no data fields or group-by fields are specified", () => {
        const input = [
            { name: "alpha", data: 123 },
            { name: "beta", data: 456 },
            { name: "beta", data: 789 },
        ];

        expect(transform({ type: "aggregate" }, input)).toEqual([{ count: 3 }]);
    });

    test("Default to count when no data fields fields are specified", () => {
        const input = [
            { name: "alpha", data: 123 },
            { name: "beta", data: 456 },
            { name: "beta", data: 789 },
        ];

        expect(
            transform({ type: "aggregate", groupby: ["name"] }, input)
        ).toEqual([
            { name: "alpha", count: 1 },
            { name: "beta", count: 2 },
        ]);
    });

    test("Compute count, sum, min, max, and mean for groups. Use default output field names.", () => {
        const input = [
            { name: "alpha", data: 123 },
            { name: "beta", data: 456 },
            { name: "beta", data: 789 },
        ];

        expect(
            transform(
                {
                    type: "aggregate",
                    groupby: ["name"],
                    fields: ["data", "data", "data", "data", "data"],
                    ops: ["count", "sum", "min", "max", "mean"],
                },
                input
            )
        ).toEqual([
            {
                name: "alpha",
                count_data: 1,
                sum_data: 123,
                min_data: 123,
                max_data: 123,
                mean_data: 123,
            },
            {
                name: "beta",
                count_data: 2,
                sum_data: 1245,
                min_data: 456,
                max_data: 789,
                mean_data: 622.5,
            },
        ]);
    });

    test("Allow custom output field names", () => {
        const input = [
            { name: "alpha", data: 123 },
            { name: "beta", data: 456 },
            { name: "beta", data: 789 },
        ];

        expect(
            transform(
                {
                    type: "aggregate",
                    fields: ["data", "data", "data", "data", "data"],
                    ops: ["count", "sum", "min", "max", "mean"],
                    as: ["count", "total", "min", "max", "average"],
                },
                input
            )
        ).toEqual([
            {
                count: 3,
                total: 1368,
                min: 123,
                max: 789,
                average: 456,
            },
        ]);
    });

    test("Throw if the length of fields and ops does not match", () => {
        const input = [{ name: "beta", data: 789 }];

        expect(() =>
            transform(
                {
                    type: "aggregate",
                    fields: ["data", "data", "data", "data"],
                    ops: ["count", "sum", "min", "max", "mean"],
                },
                input
            )
        ).toThrow();
    });

    test("Throw if the length of fields and as does not match", () => {
        const input = [{ name: "beta", data: 789 }];

        expect(() =>
            transform(
                {
                    type: "aggregate",
                    fields: ["data"],
                    ops: ["count"],
                    as: ["count", "total"],
                },
                input
            )
        ).toThrow();
    });
});
