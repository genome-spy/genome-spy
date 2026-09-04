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

    test("clearScope removes local bindings but keeps parent traversal", () => {
        const store = new ParamStore();
        const root = store.createRootScope("owner:root");
        const child = store.createChildScope("owner:child", root);

        const rootFoo = createRef("p:root:foo", "foo");
        const childBar = createRef("p:child:bar", "bar");

        store.register(root, "foo", rootFoo);
        store.register(child, "bar", childBar);

        store.clearScope(child);

        expect(store.resolve(child, "bar")).toBeUndefined();
        expect(store.resolve(child, "foo")).toBe(rootFoo);
    });

    test("pending declarations shadow ancestors and initialize only once", () => {
        const store = new ParamStore();
        const root = store.createRootScope("root");
        const child = store.createChildScope("child", root);
        const outer = createRef("outer", "value");
        const inner = createRef("inner", "value");
        store.register(root, "value", outer);
        let calls = 0;
        store.registerInitializer(child, "value", () => {
            calls++;
            store.register(child, "value", inner);
        });

        expect(calls).toBe(0);
        expect(() => store.register(child, "value", outer)).toThrow(
            /already exists/
        );
        expect(() =>
            store.registerInitializer(child, "value", () => undefined)
        ).toThrow(/already exists/);
        expect(store.resolve(child, "value")).toBe(inner);
        expect(store.resolve(child, "value")).toBe(inner);
        expect(calls).toBe(1);
        expect(store.resolve(root, "value")).toBe(outer);
    });

    test("failed initialization can be retried and pending scopes can be cleared", () => {
        const store = new ParamStore();
        const root = store.createRootScope("root");
        let ready = false;
        const ref = createRef("value", "value");
        store.registerInitializer(root, "value", () => {
            if (!ready) {
                throw new Error("Not ready");
            }
            store.register(root, "value", ref);
        });
        expect(() => store.resolve(root, "value")).toThrow("Not ready");
        ready = true;
        expect(store.resolve(root, "value")).toBe(ref);
        store.registerInitializer(root, "unused", () => {
            throw new Error("Disposed initializer must not run");
        });
        store.clearScope(root);
        expect(store.resolve(root, "unused")).toBeUndefined();
    });

    test("recursive initialization reports the parameter instead of overflowing", () => {
        const store = new ParamStore();
        const root = store.createRootScope("root");
        store.registerInitializer(root, "a", () => {
            store.resolve(root, "b");
        });
        store.registerInitializer(root, "b", () => {
            store.resolve(root, "a");
        });
        expect(() => store.resolve(root, "a")).toThrow(/dependency cycle.*"a"/);
        // Failure clears the in-progress flag, preserving the original cycle.
        expect(() => store.resolve(root, "b")).toThrow(/dependency cycle.*"b"/);
    });
});
