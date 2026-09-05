import { expect, test } from "vitest";
import { makeParamRuntimeProvider } from "./flowTestUtils.js";
import Collector from "./collector.js";
import { isDataReady, iterateDataDependencies } from "./dataReadiness.js";
import CrossTransform from "./transforms/cross.js";
import LookupTransform from "./transforms/lookup.js";

/**
 * @param {Collector} collector
 * @param {import("./flowNode.js").Datum[]} rows
 */
function publish(collector, rows) {
    collector.reset();
    for (const row of rows) {
        collector.handle(row);
    }
    collector.complete();
}

test.each(["lookup", "cross"])(
    "%s readiness follows incorporated side data, including empty replay",
    (type) => {
        const provider = makeParamRuntimeProvider();
        const primary = new Collector();
        primary.paramRuntimeProvider = provider;
        const foreign = new Collector();
        publish(foreign, [{ id: 0, score: 7 }]);
        const transform =
            type === "lookup"
                ? new LookupTransform(
                      {
                          type: "lookup",
                          from: { values: [] },
                          key: "id",
                          fields: "x",
                          values: ["score"],
                      },
                      foreign
                  )
                : new CrossTransform(
                      { type: "cross", from: { data: { values: [] } } },
                      foreign
                  );
        const output = new Collector();
        primary.addChild(transform);
        transform.addChild(output);
        transform.initializeOnce();

        expect(isDataReady(output)).toBe(false);
        publish(primary, [{ x: 0 }]);
        expect(isDataReady(output)).toBe(true);
        expect(Array.from(output.getData())[0].score).toBe(7);
        expect(new Set(iterateDataDependencies(output))).toEqual(
            new Set([output, transform, primary, foreign])
        );

        // Domain invalidation precedes the side observer that replays primary rows.
        /** @type {boolean[]} */
        const observed = [];
        foreign.subscribeDomainChanges("readiness", () =>
            observed.push(isDataReady(output))
        );
        publish(foreign, [{ id: 0, score: 9 }]);
        provider.paramRuntime.flushNow();
        expect(observed).toEqual([false]);
        expect(isDataReady(output)).toBe(true);
        expect(Array.from(output.getData())[0].score).toBe(9);

        // Collector replay has no file boundary, and empty primary has no handle().
        publish(primary, []);
        publish(foreign, []);
        provider.paramRuntime.flushNow();
        expect(isDataReady(output)).toBe(true);
        expect(Array.from(output.getData())).toEqual([]);
        primary.repropagate();
        expect(isDataReady(output)).toBe(true);
        transform.dispose();
        expect(isDataReady(output)).toBe(false);
    }
);
