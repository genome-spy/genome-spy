import { describe, expect, test } from "vitest";
import ParamStore from "./paramStore.js";

/**
 * @param {string} id
 * @param {string} name
 * @returns {import("./types.js").ParamRef<undefined>}
 */
function createRef(id, name) {
    return {
        id,
        name,
        kind: /** @type {"base"} */ ("base"),
        get: () => undefined,
        subscribe:
            (
                /** @type {() => void} */
                _listener
            ) =>
            () =>
                undefined,
    };
}

describe("ParamStore", () => {
    test("resolves params through scope chain", () => {
        const store = new ParamStore();
        const root = store.createRootScope("owner:root");
        const child = store.createChildScope("owner:child", root);

        const rootRef = createRef("p:root", "foo");
        const childRef = createRef("p:child", "bar");

        store.register(root, "foo", rootRef);
        store.register(child, "bar", childRef);

        expect(store.resolve(child, "foo")).toBe(rootRef);
        expect(store.resolve(child, "bar")).toBe(childRef);
        expect(store.resolve(root, "bar")).toBeUndefined();
    });

    test("throws on duplicate param names in a scope", () => {
        const store = new ParamStore();
        const root = store.createRootScope("owner:root");
        const foo = createRef("p:foo", "foo");
        const otherFoo = createRef("p:foo2", "foo");

        store.register(root, "foo", foo);

        expect(() => store.register(root, "foo", otherFoo)).toThrow();
    });
});
