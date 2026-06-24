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
});
