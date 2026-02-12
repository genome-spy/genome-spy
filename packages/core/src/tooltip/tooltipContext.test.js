import { expect, test } from "vitest";
import createTooltipContext from "./tooltipContext.js";

test("Creates tooltip context with flattened rows", () => {
    const datum = {
        sample: "S1",
        nested: { value: 42, deeper: { leaf: "ok" } },
        _internal: 1,
    };

    // Non-obvious: mark is not needed for row flattening in the base context.
    const context = createTooltipContext(datum, /** @type {any} */ ({}));

    expect(context.getRows?.()).toEqual([
        { key: "sample", value: "S1" },
        { key: "nested.value", value: 42 },
        { key: "nested.deeper.leaf", value: "ok" },
    ]);

    expect(context.getGenomicRows?.()).toEqual([]);
    expect(context.hiddenRowKeys).toEqual([]);
});
