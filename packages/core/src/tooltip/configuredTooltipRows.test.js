import { expect, test } from "vitest";
import { getConfiguredTooltipRows } from "./configuredTooltipRows.js";

/**
 * @param {import("../spec/channel.js").TooltipDef} tooltip
 * @returns {any}
 */
function makeMark(tooltip) {
    return {
        encoding: {
            tooltip,
        },
        unitView: {
            paramRuntime: {
                /**
                 * @param {string} expr
                 */
                createExpression: (expr) =>
                    new Function("datum", `return ${expr};`),
            },
        },
    };
}

test("returns undefined when tooltip channel is omitted", () => {
    const mark = makeMark(undefined);
    expect(getConfiguredTooltipRows({ sample: "S1" }, mark)).toBeUndefined();
});

test("returns an empty row set when tooltip channel is null", () => {
    const mark = makeMark(null);
    expect(getConfiguredTooltipRows({ sample: "S1" }, mark)).toEqual([]);
});

test("returns configured field rows in order", () => {
    const mark = makeMark([
        { field: "sample", title: "Sample" },
        { field: "score", title: "Score", format: ".2f" },
    ]);

    expect(
        getConfiguredTooltipRows({ sample: "S1", score: 1.234 }, mark)
    ).toEqual([
        { key: "Sample", value: "S1", sourceField: "sample" },
        {
            key: "Score",
            value: "1.23",
            sourceField: "score",
            formatted: true,
        },
    ]);
});

test("supports nested fields and expressions", () => {
    const mark = makeMark([
        { field: "read.name", title: "Read" },
        { expr: "datum.start + '-' + datum.end", title: "Span" },
    ]);

    expect(
        getConfiguredTooltipRows(
            { read: { name: "r1" }, start: 10, end: 20 },
            mark
        )
    ).toEqual([
        { key: "Read", value: "r1", sourceField: "read.name" },
        { key: "Span", value: "10-20" },
    ]);
});

test("evaluates ExprRefs in datum and value definitions", () => {
    const mark = makeMark([
        { datum: { expr: "'S1'" }, title: "Sample" },
        { value: { expr: "'primary'" }, title: "Label" },
    ]);

    expect(getConfiguredTooltipRows({}, mark)).toEqual([
        { key: "Sample", value: "S1" },
        { key: "Label", value: "primary" },
    ]);
});

test("rejects an empty tooltip array", () => {
    expect(() => getConfiguredTooltipRows({}, makeMark([]))).toThrow(
        "The tooltip channel array must not be empty."
    );
});
