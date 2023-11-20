import { expect, test } from "vitest";
import { processData } from "../flowTestUtils.js";
import FilterTransform from "./filter.js";

test("FilterTransform filter rows", () => {
    const data = [1, 2, 3, 4, 5, 6].map((x) => ({ x }));

    /** @type {import("../../spec/transform.js").FilterParams} */
    const filterParams = {
        type: "filter",
        expr: "datum.x > 3 && datum.x != 5",
    };

    const t = new FilterTransform(filterParams);
    t.initialize();

    expect(processData(t, data)).toEqual([4, 6].map((x) => ({ x })));
});
