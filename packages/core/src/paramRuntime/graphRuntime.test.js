import { describe, expect, test } from "vitest";
import GraphRuntime from "./graphRuntime.js";
import LifecycleRegistry from "./lifecycleRegistry.js";

describe("GraphRuntime", () => {
    test("recomputes diamond DAG once per flush", async () => {
        const runtime = new GraphRuntime();
        const source = runtime.createWritable("scope:test", "a", "base", 1);

        let bCalls = 0;
        const b = runtime.computed("scope:test", "b", [source], () => {
            bCalls += 1;
            return source.get() + 1;
        });

        let cCalls = 0;
        const c = runtime.computed("scope:test", "c", [source], () => {
            cCalls += 1;
            return source.get() + 2;
        });

        let dCalls = 0;
        const d = runtime.computed("scope:test", "d", [b, c], () => {
            dCalls += 1;
            return b.get() + c.get();
        });

        source.set(2);
        await runtime.whenPropagated();

        expect(d.get()).toBe(7);
        expect(bCalls).toBe(2);
        expect(cCalls).toBe(2);
        expect(dCalls).toBe(2);
    });

    test("batches multiple writes in a transaction", async () => {
        const runtime = new GraphRuntime();
        const source = runtime.createWritable("scope:test", "a", "base", 1);

        let calls = 0;
        const doubled = runtime.computed(
            "scope:test",
            "doubled",
            [source],
            () => {
                calls += 1;
                return source.get() * 2;
            }
        );

        runtime.inTransaction(() => {
            source.set(2);
            source.set(3);
            source.set(4);
        });

        await runtime.whenPropagated();
        expect(doubled.get()).toBe(8);
        expect(calls).toBe(2);
    });

    test("whenPropagated resolves after effects run", async () => {
        const runtime = new GraphRuntime();
        const source = runtime.createWritable("scope:test", "a", "base", 1);

        /** @type {number[]} */
        const seen = [];
        runtime.effect("scope:test", [source], () => {
            seen.push(source.get());
        });

        source.set(2);
        await runtime.whenPropagated();

        expect(seen).toEqual([2]);
    });

    test("whenPropagated supports timeout", async () => {
        const runtime = new GraphRuntime();

        await expect(
            runtime.whenPropagated({ timeoutMs: 5 })
        ).resolves.toBeUndefined();
    });

    test("whenPropagated rejects on abort signal before propagation completes", async () => {
        const runtime = new GraphRuntime();
        const source = runtime.createWritable("scope:test", "a", "base", 1);
        const controller = new AbortController();

        /** @type {Promise<void>} */
        let waitPromise = Promise.resolve();
        runtime.inTransaction(() => {
            source.set(2);
            waitPromise = runtime.whenPropagated({
                signal: controller.signal,
            });
            controller.abort();
        });

        await expect(waitPromise).rejects.toThrow("whenPropagated aborted");
    });

    test("recomputes deeper DAG in deterministic topological order", async () => {
        const runtime = new GraphRuntime();
        const source = runtime.createWritable("scope:test", "a", "base", 1);

        /** @type {string[]} */
        const callOrder = [];

        const b = runtime.computed("scope:test", "b", [source], () => {
            callOrder.push("b");
            return source.get() + 1;
        });

        const c = runtime.computed("scope:test", "c", [source], () => {
            callOrder.push("c");
            return source.get() + 2;
        });

        const d = runtime.computed("scope:test", "d", [b], () => {
            callOrder.push("d");
            return b.get() * 2;
        });

        const e = runtime.computed("scope:test", "e", [c], () => {
            callOrder.push("e");
            return c.get() * 3;
        });

        const f = runtime.computed("scope:test", "f", [d, e], () => {
            callOrder.push("f");
            return d.get() + e.get();
        });

        // Ignore initialization-time execution order and validate update propagation order.
        callOrder.length = 0;
        source.set(2);
        await runtime.whenPropagated();

        expect(callOrder).toEqual(["b", "c", "d", "e", "f"]);
        expect(f.get()).toBe(18);
    });

    test("owner disposal tears down effects", async () => {
        const lifecycle = new LifecycleRegistry();
        const owner = lifecycle.createOwner("scope", "test");
        const runtime = new GraphRuntime({ lifecycleRegistry: lifecycle });
        const source = runtime.createWritable(owner, "a", "base", 1);

        // Non-obvious: this assertion verifies owner-scoped teardown.
        let effectCalls = 0;
        runtime.effect(owner, [source], () => {
            effectCalls += 1;
        });

        source.set(2);
        await runtime.whenPropagated();
        expect(effectCalls).toBe(1);

        lifecycle.disposeOwner(owner);

        expect(() => source.set(3)).toThrow();
    });
});
