import { expect, test } from "vitest";
import { fileURLToPath } from "node:url";
import { createGenerator } from "ts-json-schema-generator";
import { Ajv } from "ajv";

test("generated request schema matches the supported analysis grammar and budgets", () => {
    // Derive the agent contract from the shipped public types, not a second schema.
    const schema = createGenerator({
        path: fileURLToPath(new URL("./transformData.d.ts", import.meta.url)),
        type: "TransformDataOptions",
        skipTypeCheck: true,
    }).createSchema("TransformDataOptions");
    const validate = new Ajv().compile(schema);
    const request = {
        scope: { selection: "brush" },
        inputLimit: 100,
        limit: 10,
    };
    for (const step of [
        { type: "formula", expr: "datum.value * 2", as: "score" },
        { type: "filter", expr: "datum.value > 0" },
        {
            type: "aggregate",
            groupby: ["group"],
            fields: ["value"],
            ops: ["mean"],
            as: ["mean"],
        },
        {
            type: "window",
            sort: { field: "value", order: "descending" },
            ops: ["row_number"],
            as: ["rank"],
        },
        { type: "sample" },
        { type: "sample", size: 2 },
    ]) {
        expect(
            validate({ ...request, transform: [step] }),
            JSON.stringify(validate.errors)
        ).toBe(true);
    }
    for (const step of [
        { type: "lookup" },
        { type: "filter", param: "brush" },
        { type: "filter", expr: "true", debounce: 0 },
        { type: "formula", expr: { expr: "datum.value" }, as: "x" },
        { type: "formula", expr: "datum.value" },
        { type: "filter", expr: 1 },
        { type: "aggregate", ops: ["unsupported"] },
        { type: "sample", size: 0 },
        { type: "sample", size: 0.5 },
        { type: "sample", size: Number.MAX_SAFE_INTEGER + 1 },
    ])
        expect(validate({ ...request, transform: [step] })).toBe(false);
    for (const name of ["inputLimit", "limit"]) {
        for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
            expect(validate({ ...request, transform: [], [name]: value })).toBe(
                false
            );
    }
    expect(
        validate({
            ...request,
            scope: "viewport",
            transform: [],
            inputLimit: 0,
            limit: 0,
        })
    ).toBe(true);
    expect(validate({ ...request, transform: null })).toBe(false);
});
