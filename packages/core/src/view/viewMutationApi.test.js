import { describe, expect, test, vi } from "vitest";

import {
    createHeadlessEngine,
    createHeadlessViewHierarchy,
} from "../genomeSpy/headlessBootstrap.js";
import { createViewMutationApi } from "./viewMutationApi.js";

/**
 * @param {string} name
 * @returns {import("../spec/view.js").UnitSpec}
 */
function makeUnitSpec(name) {
    return {
        name,
        data: {
            values: [{ x: 1, y: 2 }],
        },
        mark: "point",
        encoding: {
            x: { field: "x", type: "quantitative" },
            y: { field: "y", type: "quantitative" },
        },
    };
}

describe("ViewMutationApi", () => {
    test("returns handles for the root and layout children", async () => {
        const { view } = await createHeadlessViewHierarchy({
            vconcat: [
                {
                    name: "tracks",
                    vconcat: [makeUnitSpec("trackA")],
                },
            ],
        });

        const api = createViewMutationApi({ viewRoot: view });
        const root = api.root();

        expect(root.isAlive()).toBe(true);
        expect(root.type).toBe("concat");
        expect(root.children()).toHaveLength(1);
        expect(root.children()[0].name).toBe("tracks");
        expect(root.parent()).toBeUndefined();
    });

    test("resolves scoped selectors to stable handles", async () => {
        const { view } = await createHeadlessViewHierarchy({
            vconcat: [
                {
                    name: "tracks",
                    vconcat: [makeUnitSpec("trackA")],
                },
            ],
        });

        const api = createViewMutationApi({ viewRoot: view });
        const first = api.get({ scope: [], view: "tracks" });
        const second = api.resolve({ scope: [], view: "tracks" });

        expect(second).toBe(first);
        expect(first.selector).toEqual({ scope: [], view: "tracks" });
        expect(first.children()[0].selector).toEqual({
            scope: [],
            view: "trackA",
        });
    });

    test("treats detached handles as stale", async () => {
        const { view } = await createHeadlessViewHierarchy({
            layer: [makeUnitSpec("trackA")],
        });

        const api = createViewMutationApi({ viewRoot: view });
        const child = api.get({ scope: [], view: "trackA" });

        await /** @type {import("./layerView.js").default} */ (
            view
        ).removeChildAt(0);

        expect(child.isAlive()).toBe(false);
        expect(api.resolve(child)).toBeUndefined();
        expect(() => api.get(child)).toThrow(/stale/i);
    });

    test("inserts a direct spec into a concat container", async () => {
        const { view } = await createHeadlessViewHierarchy({
            name: "tracks",
            vconcat: [],
        });

        const api = createViewMutationApi({ viewRoot: view });
        const childSpec = makeUnitSpec("trackA");
        const inserted = await api.insert("root", childSpec, { index: 0 });

        expect(inserted.name).toBe("trackA");
        expect(inserted.parent()).toBe(api.root());
        expect(api.root().children()).toEqual([inserted]);
        expect(api.get({ scope: [], view: "trackA" })).toBe(inserted);
        expect(/** @type {any} */ (view).spec.vconcat[0]).not.toBe(childSpec);
    });

    test("initializes chrome views for dynamically inserted concat children", async () => {
        const { view } = await createHeadlessEngine({
            vconcat: [
                {
                    name: "tracks",
                    vconcat: [],
                },
            ],
            config: {
                view: {
                    stroke: "lightgray",
                },
            },
        });

        const api = createViewMutationApi({ viewRoot: view });
        await api.insert(
            { scope: [], view: "tracks" },
            {
                ...makeUnitSpec("summary"),
                title: "Summary track",
            }
        );

        const summary = view
            .getDescendants()
            .find((descendant) => descendant.name === "summary");
        const chrome = view
            .getDescendants()
            .filter(
                (descendant) =>
                    descendant !== summary && descendant.dataParent === summary
            );
        expect(chrome.map((descendant) => descendant.name)).toEqual(
            expect.arrayContaining([
                expect.stringMatching(/^axis_/),
                expect.stringMatching(/^backgroundStroke/),
                expect.stringMatching(/^title/),
            ])
        );
        expect(
            chrome.map((descendant) => descendant.getDataInitializationState())
        ).not.toContain("none");
    });

    test("waits for inserted view fonts before loading data", async () => {
        const fontEntry = /** @type {any} */ ({
            metrics: undefined,
            texture: undefined,
        });
        /** @type {(() => void) | undefined} */
        let resolveFont;
        let fontRequested = false;
        const fontReady = new Promise((resolve) => {
            resolveFont = () => {
                fontEntry.metrics = /** @type {any} */ ({
                    capHeight: 8,
                    descent: 2,
                    common: { base: 10 },
                    measureWidth: (
                        /** @type {string} */ text,
                        /** @type {number} */ size
                    ) => text.length * size,
                });
                resolve();
            };
        });
        const fontManager = /** @type {any} */ ({
            getFont: vi.fn(() => {
                fontRequested = true;
                return fontEntry;
            }),
            getDefaultFont: () => ({
                metrics: {
                    capHeight: 8,
                    descent: 2,
                    common: { base: 10 },
                    measureWidth: (
                        /** @type {string} */ text,
                        /** @type {number} */ size
                    ) => text.length * size,
                },
            }),
            waitUntilReady: vi.fn(() =>
                fontRequested ? fontReady : Promise.resolve()
            ),
        });
        const { view } = await createHeadlessEngine(
            {
                name: "tracks",
                vconcat: [],
            },
            {
                contextOptions: {
                    fontManager,
                },
            }
        );

        const api = createViewMutationApi({ viewRoot: view });
        let resolved = false;
        const insertPromise = api
            .insert("root", {
                name: "summary",
                data: { values: [{ label: "abcd" }] },
                transform: [
                    {
                        type: "measureText",
                        field: "label",
                        font: "Roboto Condensed",
                        fontSize: 6,
                        as: "width",
                    },
                ],
                mark: "point",
                encoding: {
                    x: { field: "width", type: "quantitative" },
                },
            })
            .then(() => {
                resolved = true;
            });

        await Promise.resolve();
        expect(resolved).toBe(false);

        if (!resolveFont) {
            throw new Error("Expected font resolver.");
        }
        resolveFont();
        await insertPromise;

        const summary = view
            .getDescendants()
            .find((descendant) => descendant.name === "summary");
        const datum = summary?.flowHandle?.collector
            ? Array.from(summary.flowHandle.collector.getData())[0]
            : undefined;
        expect(fontManager.waitUntilReady).toHaveBeenCalled();
        expect(datum?.width).toBe(24);
    });

    test("inserts a direct spec into a layer container", async () => {
        const { view } = await createHeadlessViewHierarchy({
            name: "tracks",
            layer: [],
        });

        const api = createViewMutationApi({ viewRoot: view });
        const inserted = await api.insert("root", makeUnitSpec("trackA"));

        expect(inserted.type).toBe("unit");
        expect(api.root().children()).toEqual([inserted]);
    });

    test("registers explicit scopes for inserted direct specs", async () => {
        const { view } = await createHeadlessViewHierarchy({
            name: "tracks",
            vconcat: [],
        });

        const api = createViewMutationApi({ viewRoot: view });
        await api.insert(
            "root",
            {
                name: "summary",
                vconcat: [makeUnitSpec("coverage")],
            },
            { scope: "sampleA" }
        );

        expect(api.get({ scope: ["sampleA"], view: "coverage" }).name).toBe(
            "coverage"
        );
    });

    test("rejects invalid insert indexes without mutating the container", async () => {
        const { view } = await createHeadlessViewHierarchy({
            name: "tracks",
            vconcat: [],
        });

        const api = createViewMutationApi({ viewRoot: view });

        await expect(
            api.insert("root", makeUnitSpec("trackA"), { index: 1 })
        ).rejects.toMatchObject({ code: "invalidIndex" });
        expect(api.root().children()).toHaveLength(0);
    });

    test("rejects duplicate scopes in the same scope", async () => {
        const { view } = await createHeadlessViewHierarchy({
            name: "tracks",
            vconcat: [],
        });

        const api = createViewMutationApi({ viewRoot: view });

        await api.insert("root", makeUnitSpec("trackA"), {
            scope: "sampleA",
        });

        await expect(
            api.insert("root", makeUnitSpec("trackB"), {
                scope: "sampleA",
            })
        ).rejects.toMatchObject({ code: "duplicateScope" });
        expect(api.root().children()).toHaveLength(1);
    });

    test("rejects insertion under unsupported parent views", async () => {
        const { view } = await createHeadlessViewHierarchy({
            name: "tracks",
            vconcat: [makeUnitSpec("trackA")],
        });

        const api = createViewMutationApi({ viewRoot: view });
        const unit = api.get({ scope: [], view: "trackA" });

        await expect(
            api.insert(unit, makeUnitSpec("trackB"))
        ).rejects.toMatchObject({ code: "unsupportedContainer" });
    });

    test("rejects unsupported child specs for layer containers", async () => {
        const { view } = await createHeadlessViewHierarchy({
            name: "tracks",
            layer: [],
        });

        const api = createViewMutationApi({ viewRoot: view });

        await expect(
            api.insert("root", {
                name: "nestedConcat",
                vconcat: [makeUnitSpec("trackA")],
            })
        ).rejects.toMatchObject({ code: "unsupportedChildSpec" });
        expect(api.root().children()).toHaveLength(0);
    });

    test("removes a child from a concat container", async () => {
        const { view } = await createHeadlessViewHierarchy({
            name: "tracks",
            vconcat: [makeUnitSpec("trackA"), makeUnitSpec("trackB")],
        });

        const api = createViewMutationApi({ viewRoot: view });
        const trackA = api.get({ scope: [], view: "trackA" });

        await api.remove(trackA);

        expect(trackA.isAlive()).toBe(false);
        expect(api.resolve(trackA)).toBeUndefined();
        expect(api.resolve({ scope: [], view: "trackA" })).toBeUndefined();
        expect(
            api
                .root()
                .children()
                .map((child) => child.name)
        ).toEqual(["trackB"]);
    });

    test("removes a child from a layer container", async () => {
        const { view } = await createHeadlessViewHierarchy({
            name: "tracks",
            layer: [makeUnitSpec("trackA"), makeUnitSpec("trackB")],
        });

        const api = createViewMutationApi({ viewRoot: view });

        await api.remove({ scope: [], view: "trackB" });

        expect(
            api
                .root()
                .children()
                .map((child) => child.name)
        ).toEqual(["trackA"]);
    });

    test("rejects removing the root view", async () => {
        const { view } = await createHeadlessViewHierarchy({
            name: "tracks",
            vconcat: [makeUnitSpec("trackA")],
        });

        const api = createViewMutationApi({ viewRoot: view });

        await expect(api.remove("root")).rejects.toMatchObject({
            code: "cannotRemoveRoot",
        });
        expect(api.root().children()).toHaveLength(1);
    });

    test("moves a concat child within its current parent", async () => {
        const { view } = await createHeadlessViewHierarchy({
            name: "tracks",
            vconcat: [
                makeUnitSpec("trackA"),
                makeUnitSpec("trackB"),
                makeUnitSpec("trackC"),
            ],
        });

        const api = createViewMutationApi({ viewRoot: view });
        const trackB = api.get({ scope: [], view: "trackB" });
        const moved = await api.move(trackB, { index: 2 });

        expect(moved).toBe(trackB);
        expect(trackB.isAlive()).toBe(true);
        expect(
            api
                .root()
                .children()
                .map((child) => child.name)
        ).toEqual(["trackA", "trackC", "trackB"]);
        const spec = /** @type {import("../spec/view.js").VConcatSpec} */ (
            view.spec
        );
        expect(spec.vconcat.map((childSpec) => childSpec.name)).toEqual([
            "trackA",
            "trackC",
            "trackB",
        ]);
    });

    test("moves a layer child within its current parent", async () => {
        const { view } = await createHeadlessViewHierarchy({
            name: "tracks",
            layer: [
                makeUnitSpec("trackA"),
                makeUnitSpec("trackB"),
                makeUnitSpec("trackC"),
            ],
        });

        const api = createViewMutationApi({ viewRoot: view });
        await api.move({ scope: [], view: "trackC" }, { index: 0 });

        expect(
            api
                .root()
                .children()
                .map((child) => child.name)
        ).toEqual(["trackC", "trackA", "trackB"]);
        const spec = /** @type {import("../spec/view.js").LayerSpec} */ (
            view.spec
        );
        expect(spec.layer.map((childSpec) => childSpec.name)).toEqual([
            "trackC",
            "trackA",
            "trackB",
        ]);
    });

    test("rejects invalid move indexes without mutating the container", async () => {
        const { view } = await createHeadlessViewHierarchy({
            name: "tracks",
            vconcat: [makeUnitSpec("trackA"), makeUnitSpec("trackB")],
        });

        const api = createViewMutationApi({ viewRoot: view });

        await expect(
            api.move({ scope: [], view: "trackA" }, { index: 2 })
        ).rejects.toMatchObject({ code: "invalidIndex" });
        expect(
            api
                .root()
                .children()
                .map((child) => child.name)
        ).toEqual(["trackA", "trackB"]);
    });

    test("rejects moving the root view", async () => {
        const { view } = await createHeadlessViewHierarchy({
            name: "tracks",
            vconcat: [makeUnitSpec("trackA")],
        });

        const api = createViewMutationApi({ viewRoot: view });

        await expect(api.move("root", { index: 0 })).rejects.toMatchObject({
            code: "cannotMoveRoot",
        });
    });
});
