import { describe, it, expect } from "vitest";
import { createPrimitiveEventProxy } from "./interactionEvent.js";

describe("createPrimitiveEventProxy", () => {
    it("exposes primitive properties and hides non-primitives", () => {
        const mock = {
            type: "click",
            clientX: 42,
            meta: { foo: "bar" },
            nested: { a: 1 },
        };

        /** @type {any} */
        const proxy = createPrimitiveEventProxy(mock);

        // allowed primitives
        expect(proxy.type).toBe("click");
        expect(proxy.clientX).toBe(42);

        // non-primitive access throws
        expect(() => proxy.meta).toThrow(/non-primitive/);

        // keys enumeration hides non-primitives
        const keys = Object.keys(proxy);
        expect(keys).toContain("type");
        expect(keys).not.toContain("meta");

        // `in` operator respects the policy
        expect("type" in proxy).toBe(true);
        expect("meta" in proxy).toBe(false);

        // prototype is hidden
        expect(Object.getPrototypeOf(proxy)).toBeNull();
    });
});
