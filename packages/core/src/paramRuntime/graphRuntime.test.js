import { describe, expect, test, vi } from "vitest";
import GraphRuntime from "./graphRuntime.js";
import LifecycleRegistry from "./lifecycleRegistry.js";

describe("GraphRuntime", () => {
    test("does not schedule propagation without queued graph work", () => {
        const queueMicrotaskSpy = vi.spyOn(globalThis, "queueMicrotask");

        try {
            const runtime = new GraphRuntime();
            const source = runtime.createWritable("scope:test", "a", "base", 1);

            source.set(2);

            expect(queueMicrotaskSpy).not.toHaveBeenCalled();
        } finally {
            queueMicrotaskSpy.mockRestore();
        }
    });

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

        runtime.runInTransaction(() => {
            source.set(2);
            source.set(3);
            source.set(4);
        });

        await runtime.whenPropagated();
        expect(doubled.get()).toBe(8);
        expect(calls).toBe(2);
    });

    test("synchronously propagates dependencies that require it", () => {
        const runtime = new GraphRuntime();
        // Scale-backed dependencies use this mode to prevent stale derived
        // parameters from reaching the next render.
        const source = runtime.createWritable(
            "scope:test",
            "source",
            "base",
            1
        );
        source.propagation = "sync";
        const doubled = runtime.computed(
            "scope:test",
            "doubled",
            [source],
            () => source.get() * 2
        );

        source.set(2);

        expect(doubled.get()).toBe(4);
    });

    test("whenPropagated resolves after effects run", async () => {
        const runtime = new GraphRuntime();
        const source = runtime.createWritable("scope:test", "a", "base", 1);

        /** @type {number[]} */
        /** @type {(number | number[])[]} */
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
        runtime.runInTransaction(() => {
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
    test("synchronous diamonds notify observers only after full fan-out", () => {
        const runtime = new GraphRuntime();
        const source = runtime.createWritable("test", "source", "base", 1);
        source.propagation = "sync";
        const a = runtime.computed(
            "test",
            "a",
            [source],
            () => source.get() * 2
        );
        const b = runtime.computed(
            "test",
            "b",
            [source],
            () => source.get() * 3
        );
        const sum = runtime.computed(
            "test",
            "sum",
            [a, b],
            () => a.get() + b.get()
        );
        /** @type {(number | number[])[]} */
        const seen = [];
        runtime.effect("test", [sum], () => seen.push(sum.get()));
        source.set(2);
        expect(seen).toEqual([10]);
    });

    test("an effect's writes settle before the next observer", () => {
        const runtime = new GraphRuntime();
        const trigger = runtime.createWritable("test", "trigger", "base", 1);
        const published = runtime.createWritable(
            "test",
            "published",
            "base",
            1
        );
        const doubled = runtime.computed(
            "test",
            "doubled",
            [published],
            () => published.get() * 2
        );
        runtime.effect("test", [trigger], () => published.set(trigger.get()));
        /** @type {(number | number[])[]} */
        const seen = [];
        runtime.effect("test", [trigger, doubled], () =>
            seen.push([trigger.get(), doubled.get()])
        );
        trigger.set(3);
        runtime.flushNow();
        expect(seen).toEqual([[3, 6]]);
    });

    test("replay publications settle before effects and propagation waiters", async () => {
        const runtime = new GraphRuntime();
        const input = runtime.createWritable("test", "input", "base", 1);
        const published = runtime.createWritable("test", "output", "base", 0);
        const doubled = runtime.computed(
            "test",
            "doubled",
            [published],
            () => published.get() * 2
        );
        /** @type {(number | number[])[]} */
        const seen = [];
        let replays = 0;
        const replay = () => {
            replays++;
            published.set(input.get());
        };
        input.subscribe(() => runtime.requestUpdate(replay));
        runtime.effect("test", [input, doubled], () =>
            seen.push([input.get(), doubled.get()])
        );
        runtime.runInTransaction(() => {
            input.set(2);
            runtime.runInTransaction(() => input.set(3));
            runtime.flushNow();
            expect(seen).toEqual([]);
        });
        await runtime.whenPropagated();
        expect(replays).toBe(1);
        expect(seen).toEqual([[3, 6]]);
    });

    test("computed equality suppresses unchanged arrays and disposal cancels work", () => {
        const runtime = new GraphRuntime();
        const input = runtime.createWritable("test", "input", "base", 1);
        const domain = runtime.computed(
            "test",
            "domain",
            [input],
            () => [0, Math.ceil(input.get())],
            {
                equals: (a, b) => a[0] === b[0] && a[1] === b[1],
            }
        );
        const effect = vi.fn();
        runtime.effect("test", [domain], effect);
        input.set(0.5);
        runtime.flushNow();
        expect(effect).not.toHaveBeenCalled();
        input.set(3);
        domain.dispose();
        runtime.flushNow();
        expect(domain.get()).toEqual([0, 1]);
        expect(effect).not.toHaveBeenCalled();
    });

    test("failed replay rejects waiters, stops observers, and permits retry", async () => {
        const runtime = new GraphRuntime();
        const input = runtime.createWritable("test", "input", "base", 1);
        /** @type {(number | number[])[]} */
        const seen = [];
        const replay = () => {
            if (input.get() === 2) throw new Error("bad rows");
        };
        input.subscribe(() => runtime.requestUpdate(replay));
        runtime.effect("test", [input], () => seen.push(input.get()));
        input.set(2);
        const failed = expect(runtime.whenPropagated()).rejects.toThrow(
            "bad rows"
        );
        expect(() => runtime.flushNow()).toThrow("bad rows");
        await failed;
        expect(seen).toEqual([]);
        input.set(3);
        runtime.flushNow();
        expect(seen).toEqual([3]);
    });

    test("non-settling feedback fails instead of hanging the flush", () => {
        const runtime = new GraphRuntime();
        const input = runtime.createWritable("test", "input", "base", 0);
        const dispose = runtime.effect("test", [input], () =>
            input.set(input.get() + 1)
        );
        input.set(1);
        expect(() => runtime.flushNow()).toThrow(
            "Reactive propagation did not settle"
        );
        dispose();
        input.set(0);
        expect(() => runtime.flushNow()).not.toThrow();
    });
    test("manual binding disposal releases owner registrations", () => {
        const lifecycle = new LifecycleRegistry();
        const owner = lifecycle.createOwner("scope", "long-lived");
        const runtime = new GraphRuntime({ lifecycleRegistry: lifecycle });
        const source = runtime.createWritable(owner, "input", "base", 1);
        const add = lifecycle.addDisposer.bind(lifecycle);
        const unregister = vi.fn();
        vi.spyOn(lifecycle, "addDisposer").mockImplementation((id, dispose) => {
            const remove = add(id, dispose);
            return () => {
                unregister();
                remove();
            };
        });
        for (let i = 0; i < 3; i++) {
            const value = runtime.computed(owner, "binding", [source], () =>
                source.get()
            );
            const stop = runtime.effect(owner, [value], () => {});
            stop();
            value.dispose();
        }
        expect(unregister).toHaveBeenCalledTimes(6);
        lifecycle.disposeOwner(owner);
        expect(unregister).toHaveBeenCalledTimes(6);
    });

    test.each([false, true])(
        "propagation waiters release abort listeners (failure: %s)",
        async (failure) => {
            const runtime = new GraphRuntime();
            const controller = new AbortController();
            const remove = vi.spyOn(controller.signal, "removeEventListener");
            runtime.requestUpdate(() => {
                if (failure) throw new Error("failed");
            });
            const waiting = runtime.whenPropagated({
                signal: controller.signal,
            });
            if (failure) {
                const rejected = expect(waiting).rejects.toThrow("failed");
                expect(() => runtime.flushNow()).toThrow("failed");
                await rejected;
            } else {
                runtime.flushNow();
                await waiting;
            }
            expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
        }
    );
    test("retrying an equal publication repairs invalidated computed values", async () => {
        const runtime = new GraphRuntime();
        const published = runtime.createWritable(
            "test",
            "published",
            "base",
            0
        );
        const doubled = runtime.computed(
            "test",
            "doubled",
            [published],
            () => published.get() * 2
        );
        const seen = vi.fn();
        runtime.effect("test", [doubled], () => seen(doubled.get()));
        runtime.requestUpdate(() => {
            published.set(3);
            throw new Error("partial publication");
        });
        expect(() => runtime.flushNow()).toThrow("partial publication");
        await Promise.resolve();
        expect(seen).not.toHaveBeenCalled();
        // Equal source identity does not invalidate again. Retained graph work
        // must still settle after the caller resubmits the failed publication.
        runtime.requestUpdate(() => published.set(3));
        runtime.flushNow();
        expect(seen).toHaveBeenCalledExactlyOnceWith(6);
    });

    test("a throwing computed remains invalid for an explicit retry", async () => {
        const runtime = new GraphRuntime();
        const source = runtime.createWritable("test", "input", "base", 0);
        const derived = runtime.computed("test", "derived", [source], () => {
            if (source.get() === 1) throw new Error("invalid input");
            return source.get() * 2;
        });
        source.set(1);
        expect(() => runtime.flushNow()).toThrow("invalid input");
        await Promise.resolve();
        source.set(2);
        await runtime.whenPropagated();
        expect(derived.get()).toBe(4);
    });
});
