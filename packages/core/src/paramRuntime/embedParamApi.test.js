import { describe, expect, test, vi } from "vitest";

import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { resolveEmbedParam } from "./embedParamApi.js";
import { intervalSelection } from "../selection/index.js";

/**
 * @param {string} name
 * @param {import("../spec/parameter.js").Parameter[]} params
 * @returns {import("../spec/view.js").UnitSpec}
 */
const makeUnit = (name, params = []) => ({
    name,
    params,
    data: { values: [{ x: 1, y: 2 }] },
    mark: "point",
    encoding: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
    },
});

describe("embed param API", () => {
    test("reads, writes, and subscribes to root variable params", async () => {
        const { view: root } = await createHeadlessEngine(
            makeUnit("root", [{ name: "threshold", value: 1 }])
        );

        const requestRender = vi.spyOn(root.context.animator, "requestRender");
        const api = resolveEmbedParam(root, "threshold");
        const listener = vi.fn();
        const unsubscribe = api.subscribe(listener);

        expect(api.getValue()).toBe(1);

        api.setValue(2);

        expect(api.getValue()).toBe(2);
        expect(listener).toHaveBeenCalledWith(2);
        expect(requestRender).toHaveBeenCalledTimes(1);

        unsubscribe();
        api.setValue(3);

        expect(listener).toHaveBeenCalledTimes(1);
    });

    test("ignores bookmarkability when resolving params", async () => {
        const { view: root } = await createHeadlessEngine(
            makeUnit("root", [{ name: "brush", persist: false }])
        );

        const api = resolveEmbedParam(root, "brush");
        api.setValue(intervalSelection({ x: [1, 2] }));

        expect(api.getValue()).toEqual({
            type: "interval",
            intervals: { x: [1, 2] },
        });
    });

    test("collapses push outer params to their outer value", async () => {
        const { view: root } = await createHeadlessEngine({
            params: [{ name: "brush" }],
            vconcat: [
                makeUnit("overview", [
                    {
                        name: "brush",
                        select: { type: "interval", encodings: ["x"] },
                        push: "outer",
                    },
                ]),
            ],
        });

        const api = resolveEmbedParam(root, "brush");
        const value = intervalSelection({ x: [10, 20] });

        api.setValue(value);

        expect(api.getValue()).toEqual(value);
    });

    test("rejects writes to computed params", async () => {
        const { view: root } = await createHeadlessEngine(
            makeUnit("root", [
                { name: "threshold", value: 2 },
                { name: "doubleThreshold", expr: "threshold * 2" },
            ])
        );

        const api = resolveEmbedParam(root, "doubleThreshold");

        expect(api.getValue()).toBe(4);
        expect(() => api.setValue(5)).toThrow(
            'Cannot set computed parameter "doubleThreshold".'
        );
    });

    test("rejects writes to point selection params", async () => {
        const { view: root } = await createHeadlessEngine(
            makeUnit("root", [{ name: "selected", select: "point" }])
        );

        const api = resolveEmbedParam(root, "selected");

        expect(api.getValue()).toEqual({
            type: "multi",
            data: new Map(),
        });
        expect(() =>
            api.setValue(
                /** @type {any} */ ({ type: "multi", data: new Map() })
            )
        ).toThrow(
            'Cannot set point selection parameter "selected" through the embed API.'
        );
    });

    test("throws when same-name params are independent", async () => {
        const { view: root } = await createHeadlessEngine({
            params: [{ name: "threshold", value: 1 }],
            vconcat: [makeUnit("child", [{ name: "threshold", value: 2 }])],
        });

        expect(() => resolveEmbedParam(root, "threshold")).toThrow(
            'Parameter "threshold" is ambiguous.'
        );
    });
});
