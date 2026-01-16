import { describe, expect, test, vi } from "vitest";

import ScaleInstanceManager from "./scaleInstanceManager.js";

describe("ScaleInstanceManager", () => {
    test("creates scale and notifies on range changes", () => {
        const onRangeChange = vi.fn();
        const exprFn = /** @type {any} */ (() => 0);
        const manager = new ScaleInstanceManager({
            getParamMediator: () =>
                /** @type {import("../view/paramMediator.js").default} */ (
                    /** @type {unknown} */ ({
                        createExpression: () => exprFn,
                    })
                ),
            onRangeChange,
        });

        const scale = manager.createScale({
            type: "linear",
            domain: [0, 1],
            range: [0, 10],
        });

        expect(scale.range()).toEqual([0, 10]);
        expect(onRangeChange).toHaveBeenCalled();

        scale.range([0, 5]);
        expect(scale.range()).toEqual([0, 5]);
        expect(onRangeChange).toHaveBeenCalledTimes(2);
    });

    test("range expression updates on parameter changes", () => {
        let current = 1;
        /** @type {(() => void) | undefined} */
        let listener;
        const expr = /** @type {any} */ (() => current);
        expr.addListener = (/** @type {() => void} */ fn) => {
            listener = fn;
        };
        expr.invalidate = /** @returns {void} */ () => undefined;

        // Non-obvious: stub expression function to avoid vega-expression in unit tests.
        const manager = new ScaleInstanceManager({
            getParamMediator: () =>
                /** @type {import("../view/paramMediator.js").default} */ (
                    /** @type {unknown} */ ({
                        createExpression: () => expr,
                    })
                ),
            onRangeChange: /** @returns {void} */ () => undefined,
        });

        const scale = manager.createScale(
            /** @type {import("../spec/scale.js").Scale} */ ({
                type: "linear",
                domain: [0, 1],
                range: /** @type {any} */ ([{ expr: "value" }, 10]),
            })
        );

        expect(scale.range()[0]).toBe(1);

        current = 5;
        listener?.();
        expect(scale.range()[0]).toBe(5);
    });
});
