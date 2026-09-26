import { describe, expect, test } from "vitest";
import { bindExpression } from "./expressionRef.js";

/**
 * @param {string} id
 * @param {string} name
 * @param {number} initialValue
 * @param {{ batchStable?: boolean, notify?: boolean }} [options]
 */
function createMutableRef(id, name, initialValue, options = {}) {
    let value = initialValue;
    let getCalls = 0;
    const listeners = new Set();

    return {
        ref: {
            id,
            name,
            kind: /** @type {"base"} */ ("base"),
            batchStable: options.batchStable,
            get() {
                getCalls++;
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
                if (options.notify ?? true) {
                    for (const listener of listeners) {
                        listener();
                    }
                }
            }
        },
        getCalls() {
            return getCalls;
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

    test("snapshots stable globals once per refresh", () => {
        const foo = createMutableRef("p:foo", "foo", 2, {
            batchStable: true,
        });
        const bar = createMutableRef("p:bar", "bar", 3, {
            batchStable: true,
        });
        const refs = new Map([
            ["foo", foo.ref],
            ["bar", bar.ref],
        ]);
        const expression = bindExpression("foo + foo + bar", (name) =>
            refs.get(name)
        ).expression;
        const evaluator = expression.createSnapshotEvaluator();

        expect(evaluator()).toBe(7);
        expect(evaluator()).toBe(7);
        expect([foo.getCalls(), bar.getCalls()]).toEqual([1, 1]);

        foo.set(4);
        evaluator.refresh();
        expect(evaluator()).toBe(11);
        expect([foo.getCalls(), bar.getCalls()]).toEqual([2, 2]);
    });

    test("keeps passive and unknown refs live", () => {
        const passive = createMutableRef("p:passive", "passive", 2, {
            batchStable: false,
            notify: false,
        });
        const unknown = createMutableRef("p:unknown", "unknown", 3);
        const refs = new Map([
            ["passive", passive.ref],
            ["unknown", unknown.ref],
        ]);
        const expression = bindExpression("passive + unknown", (name) =>
            refs.get(name)
        ).expression;
        const evaluator = expression.createSnapshotEvaluator();

        expect(evaluator()).toBe(5);
        passive.set(4);
        unknown.set(5);
        expect(evaluator()).toBe(9);
        expect([passive.getCalls(), unknown.getCalls()]).toEqual([2, 2]);
    });

    test("snapshots the ref originally resolved from a shadowed scope", () => {
        const outer = createMutableRef("p:outer", "value", 1, {
            batchStable: true,
        });
        const inner = createMutableRef("p:inner", "value", 2, {
            batchStable: true,
        });
        let resolved = inner.ref;
        const expression = bindExpression("value", () => resolved).expression;
        const evaluator = expression.createSnapshotEvaluator();

        resolved = outer.ref;
        inner.set(3);
        evaluator.refresh();

        expect(evaluator()).toBe(3);
        expect(outer.getCalls()).toBe(0);
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
