import { expect, test } from "vitest";
import { makeParamRuntimeProvider, processData } from "../flowTestUtils.js";
import Collector from "../collector.js";
import ViewParamRuntime from "../../paramRuntime/viewParamRuntime.js";
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

test("interval filters combine x and y and repropagate linked data", () => {
    const runtime = new ViewParamRuntime();
    runtime.registerParam({
        name: "brush",
        value: { type: "interval", intervals: { x: [0, 10], y: [0, 10] } },
    });

    const source = new Collector();
    const filter = new FilterTransform(
        {
            type: "filter",
            param: "brush",
            fields: { x: "x", y: "y" },
        },
        { paramRuntime: runtime }
    );
    const output = new Collector();
    source.addChild(filter);
    filter.addChild(output);
    filter.initialize();

    const data = [
        { id: "x-only", x: 5, y: 50 },
        { id: "y-only", x: 50, y: 5 },
        { id: "both", x: 5, y: 5 },
        { id: "neither", x: 50, y: 50 },
    ];
    for (const datum of data) {
        source.handle(datum);
    }
    source.complete();

    expect(output.getData()).toEqual([data[2]]);

    runtime.setValue("brush", {
        type: "interval",
        intervals: { x: [40, 60], y: [0, 10] },
    });
    expect(output.getData()).toEqual([data[1]]);

    runtime.setValue("brush", {
        type: "interval",
        intervals: { x: null, y: null },
    });
    expect(output.getData()).toEqual(data);
});

test.each([true, false])(
    "empty interval filters follow the empty=%s policy",
    (empty) => {
        const runtime = new ViewParamRuntime();
        runtime.registerParam({
            name: "brush",
            value: { type: "interval", intervals: { x: null, y: null } },
        });

        const source = new Collector();
        const filter = new FilterTransform(
            {
                type: "filter",
                param: "brush",
                fields: { x: "x", y: "y" },
                empty,
            },
            { paramRuntime: runtime }
        );
        const output = new Collector();
        source.addChild(filter);
        filter.addChild(output);
        filter.initialize();
        source.handle({ x: 1, y: 1 });
        source.complete();

        expect(output.getData()).toEqual(empty ? [{ x: 1, y: 1 }] : []);
    }
);
