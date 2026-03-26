import { expect, test } from "vitest";
import Collector from "../collector.js";
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

test("FilterTransform caches datum-invariant scale expressions", () => {
    const resolution = createFakeScaleResolution([0, 10]);
    const provider = makeParamRuntimeProvider((channel) =>
        channel == "x" ? resolution : undefined
    );

    // Use a collecting root so scale changes can replay the input batch.
    const source = new Collector();
    const transform = new FilterTransform(
        {
            type: "filter",
            expr: "invert('x', range('x')[1]) < domain('x')[1]",
        },
        provider
    );
    const sink = new Collector();
    source.addChild(transform);
    transform.addChild(sink);
    transform.initialize();

    source.handle({ x: 1 });
    source.handle({ x: 2 });
    source.complete();

    expect([...sink.getData()]).toEqual([{ x: 1 }, { x: 2 }]);

    resolution.setDomain([0, 4]);

    expect([...sink.getData()]).toEqual([]);
});

/**
 * @param {number[]} initialDomain
 * @returns {any}
 */
function createFakeScaleResolution(initialDomain) {
    let domain = initialDomain;
    const range = [0, 10];
    /** @type {Record<"domain" | "range", Set<() => void>>} */
    const listeners = {
        domain: new Set(),
        range: new Set(),
    };

    return {
        addEventListener(
            /** @type {"domain" | "range"} */ type,
            /** @type {() => void} */ listener
        ) {
            listeners[type].add(listener);
        },
        removeEventListener(
            /** @type {"domain" | "range"} */ type,
            /** @type {() => void} */ listener
        ) {
            listeners[type].delete(listener);
        },
        getDomain() {
            return domain;
        },
        getScale() {
            return Object.assign(
                /** @param {number} value */ (value) => value * 2,
                {
                    range: () => range,
                    invert: (/** @type {number} */ value) => value / 2,
                }
            );
        },
        setDomain(/** @type {number[]} */ nextDomain) {
            domain = nextDomain;
            for (const listener of listeners.domain) {
                listener();
            }
        },
    };
}
