import { describe, expect, test, vi } from "vitest";

import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import {
    createEmbedParamNamespace,
    resolveEmbedParam,
    resolveEmbedSelection,
    resolveScopedEmbedParam,
} from "./embedParamApi.js";
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

    test("delivers legacy and scoped param observations after a batch settles", async () => {
        const { view: root } = await createHeadlessEngine(
            makeUnit("root", [
                { name: "first", value: 1 },
                { name: "second", value: 2 },
                { name: "sum", expr: "first + second" },
            ])
        );

        const scoped = createEmbedParamNamespace(root);
        const scopedFirst = scoped.get("first");
        const scopedSecond = scoped.get("second");
        const legacyFirst = resolveEmbedParam(root, "first");
        /** @type {{ first: number, second: number, sum: number }[]} */
        const scopedValues = [];
        /** @type {{ first: number, second: number, sum: number }[]} */
        const legacyValues = [];
        const readValues = () => ({
            first: /** @type {number} */ (scopedFirst.getValue()),
            second: /** @type {number} */ (scopedSecond.getValue()),
            sum: /** @type {number} */ (scoped.get("sum").getValue()),
        });

        scopedFirst.subscribe(() => scopedValues.push(readValues()));
        legacyFirst.subscribe(() => legacyValues.push(readValues()));
        expect(scopedValues).toHaveLength(0);
        expect(legacyValues).toHaveLength(0);

        root.paramRuntime.runInTransaction(() => {
            scopedFirst.setValue(3);
            scopedSecond.setValue(4);
        });
        await root.paramRuntime.whenPropagated();

        expect(scopedValues).toEqual([{ first: 3, second: 4, sum: 7 }]);
        expect(legacyValues).toEqual([{ first: 3, second: 4, sum: 7 }]);
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

    test("returns detached interval selection snapshots from a scoped API", async () => {
        const { view: root } = await createHeadlessEngine({
            params: [
                {
                    name: "brush",
                    select: { type: "interval", encodings: ["x"] },
                },
                {
                    name: "brushEnd",
                    expr: "brush.intervals.x ? brush.intervals.x[1] : 0",
                },
            ],
            vconcat: [makeUnit("track")],
        });

        const selection = resolveEmbedSelection(root, "brush");
        const param = resolveScopedEmbedParam(root, "brush");

        expect(selection.getValue()).toEqual({
            type: "interval",
            active: false,
            intervals: { x: null },
        });

        param.setValue(intervalSelection({ x: [1, 2] }));
        const snapshot = /** @type {any} */ (selection.getValue());
        expect(snapshot).toEqual({
            type: "interval",
            active: true,
            intervals: { x: [1, 2] },
        });

        /** @type {any} */ (snapshot.intervals.x)[0] = 99;
        expect(/** @type {any} */ (selection.getValue()).intervals.x).toEqual([
            1, 2,
        ]);

        selection.clear();
        expect(selection.getValue().active).toBe(false);
    });

    test("delivers interval commits after programmatic writes", async () => {
        const { view: root } = await createHeadlessEngine({
            params: [
                {
                    name: "brush",
                    select: { type: "interval", encodings: ["x"] },
                },
                {
                    name: "brushEnd",
                    expr: "brush.intervals.x ? brush.intervals.x[1] : 0",
                },
            ],
            vconcat: [makeUnit("track")],
        });

        const selection = resolveEmbedSelection(root, "brush");
        /** @type {import("../types/embedApi.js").SelectionSnapshot[]} */
        const commits = [];
        /** @type {number | undefined} */
        let observedBrushEnd;
        selection.subscribe(
            (snapshot) => {
                commits.push(snapshot);
                observedBrushEnd = root.paramRuntime.getValue("brushEnd");
            },
            {
                delivery: "commit",
            }
        );

        resolveScopedEmbedParam(root, "brush").setValue(
            intervalSelection({ x: [1, 2] })
        );

        expect(commits).toHaveLength(1);
        expect(observedBrushEnd).toBe(2);
        expect(commits[0]).toMatchObject({
            type: "interval",
            active: true,
        });
    });

    test("a plain nearest declaration shadows an ancestor selection", async () => {
        const { view: root } = await createHeadlessEngine({
            params: [
                {
                    name: "brush",
                    select: { type: "interval", encodings: ["x"] },
                },
            ],
            vconcat: [makeUnit("track", [{ name: "brush", value: 1 }])],
        });

        const child = /** @type {any} */ (root).children[0];
        expect(() => resolveEmbedSelection(child, "brush")).toThrow(
            'Parameter "brush" is not a selection in this scope.'
        );
    });

    test("keeps a child selection capability across a push outer alias", async () => {
        const { view: root } = await createHeadlessEngine({
            params: [{ name: "brush" }],
            vconcat: [
                makeUnit("track", [
                    {
                        name: "brush",
                        select: { type: "interval", encodings: ["x"] },
                        push: "outer",
                    },
                ]),
            ],
        });

        const child = /** @type {any} */ (root).children[0];
        expect(resolveEmbedSelection(child, "brush").type).toBe("interval");
        expect(() => resolveEmbedSelection(root, "brush")).toThrow(
            'Parameter "brush" is not a selection in this scope.'
        );
    });

    test("exposes row-backed point selection snapshots", async () => {
        const { view: root } = await createHeadlessEngine(
            makeUnit("root", [{ name: "selected", select: "point" }])
        );

        const selection = resolveEmbedSelection(root, "selected");
        expect(selection.getValue()).toEqual({
            type: "point",
            active: false,
            data: [],
        });

        const datum = /** @type {any} */ (root).getCollector().getData()[0];
        /** @type {any} */ (resolveScopedEmbedParam(root, "selected")).setValue(
            {
                type: "single",
                datum,
                uniqueId: datum.__uniqueId,
            }
        );

        expect(selection.getValue()).toEqual({
            type: "point",
            active: true,
            data: [{ x: 1, y: 2 }],
        });

        selection.clear();
        expect(selection.getValue().active).toBe(false);
    });

    test("invalidates handles and disposes subscriptions with their view", async () => {
        const { view: root } = await createHeadlessEngine(
            makeUnit("root", [
                { name: "threshold", value: 1 },
                {
                    name: "brush",
                    select: "point",
                },
            ])
        );
        let active = true;
        let live = true;
        /** @type {(() => void)[]} */
        const disposers = [];
        const namespace = createEmbedParamNamespace(root, {
            isActive: () => active,
            isLive: () => live,
            registerDisposer: (disposer) => disposers.push(disposer),
        });
        const param = namespace.get("threshold");
        const listener = vi.fn();
        param.subscribe(listener);
        const selection = namespace.getSelection("brush");
        selection.subscribe(vi.fn());

        active = false;
        expect(() => namespace.get("threshold")).toThrow(/finalized/);
        expect(() => param.getValue()).toThrow(/finalized/);
        expect(() => param.setValue(2)).toThrow(/finalized/);
        expect(() => param.subscribe(listener)).toThrow(/finalized/);
        expect(() => selection.getValue()).toThrow(/finalized/);
        expect(() => selection.clear()).toThrow(/finalized/);
        expect(() => selection.subscribe(vi.fn())).toThrow(/finalized/);

        active = true;
        live = false;
        expect(() => namespace.get("threshold")).toThrow(/removed/);
        expect(() => param.getValue()).toThrow(/removed/);
        expect(() => selection.getValue()).toThrow(/removed/);
        expect(() => selection.clear()).toThrow(/removed/);

        for (const disposer of disposers) {
            disposer();
        }
        root.paramRuntime.setValue("threshold", 2);
        expect(listener).not.toHaveBeenCalled();
    });
});
