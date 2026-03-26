import { expect, test, vi } from "vitest";
import { makeParamRuntimeProvider, processData } from "../flowTestUtils.js";
import FilterTransform from "./filter.js";

test.todo("Implement stub for ParamRuntime");

test("FilterTransform filter rows", () => {
    const data = [1, 2, 3, 4, 5, 6].map((x) => ({ x }));

    /** @type {import("../../spec/transform.js").FilterParams} */
    const filterParams = {
        type: "filter",
        expr: "datum.x > 3 && datum.x != 5",
    };

    const t = new FilterTransform(filterParams, makeParamRuntimeProvider());
    t.initialize();

    expect(processData(t, data)).toEqual([4, 6].map((x) => ({ x })));
});

test("FilterTransform does not cache random expressions", () => {
    const randomSpy = vi.spyOn(Math, "random");
    randomSpy.mockImplementation(() => {
        const value = [0.2, 0.8][randomSpy.mock.calls.length - 1];
        return value ?? 0.5;
    });

    try {
        const t = new FilterTransform(
            {
                type: "filter",
                expr: "random() > 0.5",
            },
            makeParamRuntimeProvider()
        );
        t.initialize();

        expect(processData(t, [{}, {}])).toEqual([{}]);
    } finally {
        randomSpy.mockRestore();
    }
});
