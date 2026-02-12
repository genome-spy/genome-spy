import { expect, test } from "vitest";
import { flattenDatumRows } from "./flattenDatumRows.js";

test("Flattens nested datum fields and omits internal keys", () => {
    const rows = flattenDatumRows({
        sample: "S1",
        nested: {
            value: 42,
            deeper: {
                leaf: "ok",
            },
        },
        _internal: "ignore",
    });

    expect(rows).toEqual([
        { key: "sample", value: "S1" },
        { key: "nested.value", value: 42 },
        { key: "nested.deeper.leaf", value: "ok" },
    ]);
});
