import { describe, expect, test, vi } from "vitest";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import Collector from "./collector.js";
import { isDataReady } from "./dataReadiness.js";
import LookupTransform from "./transforms/lookup.js";
import CrossTransform from "./transforms/cross.js";

/** @param {Collector} collector @param {object[]} rows */
function publish(collector, rows) {
    collector.reset();
    for (const row of rows) collector.handle(row);
    collector.complete();
}

/** @param {"lookup" | "cross"} kind */
function fixture(kind) {
    const runtime = new ViewParamRuntime();
    runtime.registerParam({ name: "factor", value: 1 });
    const primary = new Collector();
    primary.paramRuntimeProvider = { paramRuntime: runtime };
    const foreign = new Collector();
    const transform =
        kind === "lookup"
            ? new LookupTransform(
                  {
                      type: "lookup",
                      from: { values: [] },
                      key: "id",
                      values: ["score"],
                  },
                  foreign
              )
            : new CrossTransform(
                  { type: "cross", from: { data: { values: [] } } },
                  foreign
              );
    const output = new Collector();
    primary.addChild(transform);
    transform.addChild(output);
    transform.initializeOnce();
    publish(foreign, [{ id: 0, score: 2 }]);
    publish(primary, kind === "lookup" ? [{ id: 0 }] : [{ x: 0 }]);
    return { runtime, primary, foreign, transform, output };
}

describe("declared side publications", () => {
    test.each(/** @type {const} */ (["lookup", "cross"]))(
        "%s skips unchanged side replay and stamps before output observers",
        (kind) => {
            const { runtime, primary, foreign, transform, output } =
                fixture(kind);
            const replay = vi.spyOn(primary, "repropagate");
            const observed = vi.fn(() => isDataReady(output));
            output.observe(observed);
            foreign.repropagate();
            runtime.flushNow();
            expect(replay).not.toHaveBeenCalled();
            publish(foreign, [{ id: 0, score: 9 }]);
            expect(isDataReady(output)).toBe(false);
            runtime.flushNow();
            expect(replay).toHaveBeenCalledTimes(1);
            expect(observed.mock.results.map((r) => r.value)).toEqual([true]);
            expect(Array.from(output.getData())[0].score).toBe(9);
            expect(transform.isDataReady()).toBe(true);
            primary.disposeSubtree();
            runtime.dispose();
        }
    );

    test("unchanged relation can satisfy a previously skipped coverage publication", () => {
        const { runtime, primary, foreign, transform, output } =
            fixture("lookup");
        let available = false;
        transform.areDataDependenciesAvailable = () => available;
        primary.reset();
        // Model coordinate lookup discarding a batch while coverage is pending.
        transform.consumeDataDependencies();
        primary.complete();
        expect(isDataReady(output)).toBe(false);
        available = true;
        const revision = foreign.dataRevision;
        foreign.repropagate();
        runtime.flushNow();
        expect(foreign.dataRevision).toBe(revision);
        expect(isDataReady(output)).toBe(true);
        available = false;
        expect(isDataReady(output)).toBe(false);
        primary.disposeSubtree();
        runtime.dispose();
    });

    test("a consumed revision cannot certify data replaced before completion", () => {
        const { runtime, primary, foreign, transform, output } =
            fixture("lookup");
        transform.reset();
        transform.handle({ id: 0 });
        publish(foreign, [{ id: 0, score: 8 }]);
        transform.complete();
        expect(isDataReady(output)).toBe(false);
        primary.disposeSubtree();
        runtime.dispose();
    });

    test("empty cross input cannot certify a later nonempty side publication", () => {
        const { runtime, primary, foreign, transform, output } =
            fixture("cross");
        publish(foreign, []);
        runtime.flushNow();
        transform.reset();
        transform.handle({ x: 0 });
        publish(foreign, [{ score: 9 }]);
        transform.complete();
        expect(isDataReady(output)).toBe(false);
        primary.disposeSubtree();
        runtime.dispose();
    });

    test("disposing one consumer preserves queued work needed by its sibling", () => {
        const { runtime, primary, foreign, transform } = fixture("lookup");
        const sibling = new LookupTransform(
            {
                type: "lookup",
                from: { values: [] },
                key: "id",
                values: ["score"],
            },
            foreign
        );
        const output = new Collector();
        primary.addChild(sibling);
        sibling.addChild(output);
        sibling.initializeOnce();
        primary.repropagate();
        const observers = foreign.observers.size;
        publish(foreign, [{ id: 0, score: 7 }]);
        primary.removeChild(transform);
        transform.disposeSubtree();
        runtime.flushNow();
        expect(foreign.observers.size).toBe(observers - 1);
        expect(Array.from(output.getData())[0].score).toBe(7);
        primary.disposeSubtree();
        runtime.dispose();
    });

    test("multiple side inputs coalesce at their shared primary replay root", () => {
        const { runtime, primary, foreign, output } = fixture("lookup");
        const second = new Collector();
        publish(second, [{ tag: "old" }]);
        const cross = new CrossTransform(
            { type: "cross", from: { data: { values: [] } } },
            second
        );
        const last = new Collector();
        primary.addChild(cross);
        cross.addChild(last);
        cross.initializeOnce();
        primary.repropagate();
        const replay = vi.spyOn(primary, "repropagate");
        runtime.runInTransaction(() => {
            publish(foreign, [{ id: 0, score: 5 }]);
            publish(second, [{ tag: "new" }]);
        });
        runtime.flushNow();
        expect(replay).toHaveBeenCalledTimes(1);
        expect(Array.from(output.getData())[0].score).toBe(5);
        expect(Array.from(last.getData())[0].tag).toBe("new");
        expect(isDataReady(output) && isDataReady(last)).toBe(true);
        primary.disposeSubtree();
        runtime.dispose();
    });

    test("failed lookup replay stays unready until explicit successful replay", async () => {
        const { runtime, primary, foreign, transform, output } =
            fixture("lookup");
        publish(foreign, [
            { id: 0, score: 3 },
            { id: 0, score: 4 },
        ]);
        const failed = expect(runtime.whenPropagated()).rejects.toThrow(
            /Duplicate lookup key/
        );
        expect(() => runtime.flushNow()).toThrow(/Duplicate lookup key/);
        await failed;
        expect(isDataReady(output)).toBe(false);
        publish(foreign, [{ id: 0, score: 5 }]);
        transform.requestRepropagate();
        runtime.flushNow();
        expect(isDataReady(output)).toBe(true);
        expect(Array.from(output.getData())[0].score).toBe(5);
        primary.disposeSubtree();
        runtime.dispose();
    });

    test("empty cross checks availability once while processing a primary batch", () => {
        const { runtime, primary, foreign, transform } = fixture("cross");
        publish(foreign, []);
        runtime.flushNow();
        transform.reset();
        const available = vi.spyOn(transform, "areDataDependenciesAvailable");
        // Empty output must still consume its input, without per-row policy work.
        for (let x = 0; x < 1000; x++) transform.handle({ x });
        expect(available).toHaveBeenCalledTimes(1);
        transform.complete();
        expect(transform.isDataReady()).toBe(true);
        primary.disposeSubtree();
        runtime.dispose();
    });

    test("failed cross preparation does not cache a successfully validated revision", () => {
        const { runtime, primary, foreign, transform, output } =
            fixture("cross");
        publish(foreign, [{ a: 1 }, { b: 2 }]);
        expect(() => runtime.flushNow()).toThrow(/homogeneous fields/);
        expect(isDataReady(output)).toBe(false);
        transform.requestRepropagate();
        expect(() => runtime.flushNow()).toThrow(/homogeneous fields/);
        primary.disposeSubtree();
        runtime.dispose();
    });

    test("implicit lookup fields rebuild after empty and changed foreign schemas", () => {
        const runtime = new ViewParamRuntime();
        const primary = new Collector();
        primary.paramRuntimeProvider = { paramRuntime: runtime };
        const foreign = new Collector();
        const lookup = new LookupTransform(
            { type: "lookup", from: { values: [] }, key: "id" },
            foreign
        );
        const output = new Collector();
        primary.addChild(lookup);
        lookup.addChild(output);
        lookup.initializeOnce();
        publish(foreign, [{ id: 0, score: 2 }]);
        publish(primary, [{ id: 0 }]);
        expect(Array.from(output.getData())).toEqual([{ id: 0, score: 2 }]);
        publish(foreign, []);
        runtime.flushNow();
        expect(Array.from(output.getData())).toEqual([{ id: 0 }]);
        publish(foreign, [{ id: 0, label: "new" }]);
        runtime.flushNow();
        expect(Array.from(output.getData())).toEqual([{ id: 0, label: "new" }]);
        expect(isDataReady(output)).toBe(true);
        primary.disposeSubtree();
        runtime.dispose();
    });

    test("pending primary collection cannot publish when a side input arrives", () => {
        const { runtime, primary, foreign, output } = fixture("lookup");
        primary.reset();
        publish(foreign, [{ id: 0, score: 5 }]);
        runtime.flushNow();
        expect(output.completed).toBe(false);
        publish(primary, [{ id: 0 }]);
        expect(isDataReady(output)).toBe(true);
        expect(Array.from(output.getData())[0].score).toBe(5);
        primary.disposeSubtree();
        runtime.dispose();
    });

    test.each([false, true])(
        "independent foreign replay precedes primary (foreign queued first: %s)",
        async (foreignFirst) => {
            const { view } = await createHeadlessEngine({
                params: [
                    { name: "primaryValue", value: 1 },
                    { name: "foreignValue", value: 2 },
                ],
                data: { values: [{ x: 0 }] },
                transform: [
                    { type: "formula", expr: "primaryValue", as: "p" },
                    {
                        type: "cross",
                        from: {
                            data: { values: [{ y: 0 }] },
                            transform: [
                                {
                                    type: "formula",
                                    expr: "foreignValue",
                                    as: "f",
                                },
                            ],
                        },
                    },
                ],
                mark: "point",
                encoding: {
                    size: { field: "f", type: "quantitative", legend: null },
                },
            });
            const output = view.flowHandle.collector;
            const rows = vi.fn(() =>
                Array.from(output.getData(), (d) => [d.p, d.f])
            );
            output.observe(rows);
            view.paramRuntime.runInTransaction(() => {
                if (foreignFirst)
                    view.paramRuntime.setValue("foreignValue", 20);
                view.paramRuntime.setValue("primaryValue", 10);
                if (!foreignFirst)
                    view.paramRuntime.setValue("foreignValue", 20);
            });
            await view.paramRuntime.whenPropagated();
            expect(rows.mock.results.map((r) => r.value)).toEqual([[[10, 20]]]);
            expect(isDataReady(output)).toBe(true);
            expect(view.getScaleResolution("size").getDomain()).toEqual([
                0, 20,
            ]);
            view.disposeSubtree();
        }
    );
});
