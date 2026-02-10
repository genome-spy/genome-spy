import { describe, expect, test } from "vitest";
import { bindExpression } from "./expressionRef.js";

/**
 * @param {string} id
 * @param {string} name
 * @param {number} initialValue
 */
function createMutableRef(id, name, initialValue) {
    let value = initialValue;
    const listeners = new Set();

    return {
        ref: {
            id,
            name,
            kind: /** @type {"base"} */ ("base"),
            get() {
                return value;
            },
            subscribe(
                /** @type {() => void} */
                listener
            ) {
                listeners.add(listener);
                return () => {
                    listeners.delete(listener);
                };
            },
        },
        set(
            /** @type {number} */
            nextValue
        ) {
            if (nextValue !== value) {
                value = nextValue;
                for (const listener of listeners) {
                    listener();
                }
            }
        },
    };
}

describe("bindExpression", () => {
    test("fails fast on unknown globals", () => {
        expect(() => bindExpression("missing + 1", () => undefined)).toThrow(
            'Unknown variable "missing"'
        );
    });

    test("subscribes to duplicate globals only once", () => {
        const foo = createMutableRef("p:foo", "foo", 2);
        const { expression } = bindExpression("foo + foo", (name) => {
            return name == "foo" ? foo.ref : undefined;
        });

        let calls = 0;
        const listener = () => {
            calls += 1;
        };

        expression.subscribe(listener);
        foo.set(3);

        expect(expression()).toBe(6);
        expect(calls).toBe(1);
    });

    test("listener invalidation is expression-instance local", () => {
        const foo = createMutableRef("p:foo", "foo", 1);
        /** @type {(name: string) => import("./types.js").ParamRef<any> | undefined} */
        const resolve = (name) => {
            return name == "foo" ? foo.ref : undefined;
        };

        // Non-obvious: same source expression code should still maintain
        // independent listener lifecycles for each instance.
        const exprA = bindExpression("foo + 1", resolve).expression;
        const exprB = bindExpression("foo + 1", resolve).expression;

        let callsA = 0;
        let callsB = 0;

        exprA.subscribe(() => {
            callsA += 1;
        });
        exprB.subscribe(() => {
            callsB += 1;
        });

        foo.set(2);
        expect(callsA).toBe(1);
        expect(callsB).toBe(1);

        exprA.invalidate();
        foo.set(3);

        expect(callsA).toBe(1);
        expect(callsB).toBe(2);
    });

    test("identifier includes dependency identity", () => {
        const fooA = createMutableRef("p:foo:a", "foo", 1);
        const fooB = createMutableRef("p:foo:b", "foo", 1);

        const exprA = bindExpression("foo + 1", (name) => {
            return name == "foo" ? fooA.ref : undefined;
        }).expression;
        const exprB = bindExpression("foo + 1", (name) => {
            return name == "foo" ? fooB.ref : undefined;
        }).expression;

        expect(exprA.identifier()).not.toBe(exprB.identifier());
    });
});
