import { describe, expect, test } from "vitest";

import { createHeadlessViewHierarchy } from "../genomeSpy/headlessBootstrap.js";
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
});
