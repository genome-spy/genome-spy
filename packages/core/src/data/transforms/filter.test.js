import { processData } from "../flowTestUtils";
import FilterTransform from "./filter";

test("FilterTransform filter rows", () => {
    const data = [1, 2, 3, 4, 5, 6].map((x) => ({ x }));

    /** @type {import("../../spec/transform").FilterParams} */
    const filterParams = {
        type: "filter",
        expr: "datum.x > 3 && datum.x != 5",
    };

    const t = new FilterTransform(filterParams);
    t.initialize();

    expect(processData(t, data)).toEqual([4, 6].map((x) => ({ x })));
});
