import { expect, test } from "vitest";
import Collector from "../collector.js";
import { makeParamRuntimeProvider, processData } from "../flowTestUtils.js";
import FormulaTransform from "./formula.js";

test.todo("Implement stub for ParamRuntime");

test("FormulaTransform", () => {
    const data = [{ a: 2 }, { a: 3 }];

    const t = new FormulaTransform(
        {
            type: "formula",
            expr: "datum.a * 2",
            as: "b",
        },
        makeParamRuntimeProvider()
    );

    t.initialize();

    expect(processData(t, data)).toEqual([
        { a: 2, b: 4 },
        { a: 3, b: 6 },
    ]);
});

test("FormulaTransform caches datum-invariant scale expressions", () => {
    const resolution = createFakeScaleResolution([1, 5], (value) => value * 2);
    const provider = makeParamRuntimeProvider((channel) =>
        channel == "x" ? resolution : undefined
    );

    // Use a collecting root so scale changes can replay the input batch.
    const source = new Collector();
    const transform = new FormulaTransform(
        {
            type: "formula",
            expr: "scale('x', 2) + domain('x')[1]",
            as: "b",
        },
        provider
    );
    const sink = new Collector();
    source.addChild(transform);
    transform.addChild(sink);
    transform.initialize();

    source.handle({ a: 2 });
    source.handle({ a: 3 });
    source.complete();

    expect([...sink.getData()]).toEqual([
        { a: 2, b: 9 },
        { a: 3, b: 9 },
    ]);

    resolution.setDomain([2, 8]);

    expect([...sink.getData()]).toEqual([
        { a: 2, b: 12 },
        { a: 3, b: 12 },
    ]);
});

/**
 * @param {number[]} initialDomain
 * @param {(value: number) => number} scaleFn
 * @returns {any}
 */
function createFakeScaleResolution(initialDomain, scaleFn) {
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
            return Object.assign(scaleFn, {
                range: () => range,
                invert: (/** @type {number} */ value) => value / 2,
            });
        },
        setDomain(/** @type {number[]} */ nextDomain) {
            domain = nextDomain;
            for (const listener of listeners.domain) {
                listener();
            }
        },
    };
}
