import { describe, expect, test, vi } from "vitest";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import Collector from "./collector.js";
import FilterTransform from "./transforms/filter.js";
import FormulaTransform from "./transforms/formula.js";
import InlineSource from "./sources/inlineSource.js";
import DataSource from "./sources/dataSource.js";

/** @param {ViewParamRuntime} runtime */
function makeFilter(runtime) {
    return new FilterTransform(
        { type: "filter", expr: "datum.x >= lower" },
        { paramRuntime: runtime }
    );
}

/** @param {ViewParamRuntime} runtime */
function makeFormula(runtime) {
    return new FormulaTransform(
        { type: "formula", expr: "datum.x * factor", as: "y" },
        { paramRuntime: runtime }
    );
}

function makeRuntime() {
    const runtime = new ViewParamRuntime();
    runtime.registerParam({ name: "lower", value: 0 });
    runtime.registerParam({ name: "factor", value: 1 });
    return runtime;
}

/** @param {Collector} collector */
function publish(collector) {
    for (const x of [1, 2, 3]) {
        collector.handle({ x });
    }
    collector.complete();
}

describe("parameter-triggered streaming replay", () => {
    test.each([false, true])(
        "chained filter/formula publishes once (intermediate collector: %s)",
        async (intermediate) => {
            const runtime = makeRuntime();
            const source = new Collector();
            const filter = makeFilter(runtime);
            const formula = makeFormula(runtime);
            const output = new Collector();
            source.addChild(filter);
            if (intermediate) {
                const stored = new Collector();
                filter.addChild(stored);
                stored.addChild(formula);
            } else {
                filter.addChild(formula);
            }
            formula.addChild(output);
            filter.initialize();
            formula.initialize();
            publish(source);
            const replay = vi.spyOn(source, "repropagate");
            /** @type {number[][]} */
            const publications = [];
            output.observers.add(() =>
                publications.push(Array.from(output.getData(), (d) => d.y))
            );

            runtime.runInTransaction(() => {
                // Queue the descendant first to test ancestor subsumption.
                runtime.setValue("factor", 10);
                runtime.setValue("lower", 2);
            });
            await runtime.whenPropagated();
            expect(replay).toHaveBeenCalledTimes(1);
            expect(publications).toEqual([[20, 30]]);

            runtime.setValue("lower", 4);
            expect(publications).toEqual([[20, 30], []]);
        }
    );

    test("graph observers see both sibling collectors after publication", () => {
        const runtime = makeRuntime();
        const source = new Collector();
        const left = makeFilter(runtime);
        const right = makeFilter(runtime);
        const outputs = [new Collector(), new Collector()];
        source.addChild(left);
        source.addChild(right);
        left.addChild(outputs[0]);
        right.addChild(outputs[1]);
        left.initialize();
        right.initialize();
        publish(source);

        runtime.registerParam({ name: "revision", value: 0 });
        let revision = 0;
        for (const output of outputs) {
            output.observers.add(() =>
                runtime.setValue("revision", ++revision)
            );
        }
        const expression = runtime.createExpression("revision");
        /** @type {number[][][]} */
        const seen = [];
        runtime.effect(expression.dependencies, () => {
            seen.push(
                outputs.map((output) =>
                    Array.from(output.getData(), (d) => d.x)
                )
            );
        });
        const replay = vi.spyOn(source, "repropagate");
        runtime.setValue("lower", 2);
        expect(replay).toHaveBeenCalledTimes(1);
        expect(seen).toEqual([
            [
                [2, 3],
                [2, 3],
            ],
        ]);
    });

    test("disposing a transform preserves another subscriber's shared replay", async () => {
        const runtime = makeRuntime();
        const source = new Collector();
        const removed = makeFilter(runtime);
        const retained = makeFilter(runtime);
        const output = new Collector();
        source.addChild(removed);
        source.addChild(retained);
        retained.addChild(output);
        removed.initialize();
        retained.initialize();
        publish(source);
        runtime.runInTransaction(() => {
            runtime.setValue("lower", 2);
            source.removeChild(removed);
            removed.dispose();
        });
        await runtime.whenPropagated();
        expect(Array.from(output.getData(), (d) => d.x)).toEqual([2, 3]);
        const replay = vi.spyOn(source, "repropagate");
        runtime.runInTransaction(() => {
            runtime.setValue("lower", 3);
            source.disposeSubtree();
        });
        await runtime.whenPropagated();
        expect(replay).not.toHaveBeenCalled();
    });

    test.each([false, true])(
        "failed replay stops effects and can retry (inline source: %s)",
        async (inline) => {
            const runtime = makeRuntime();
            const source = inline
                ? new InlineSource(
                      { values: [{ x: 1 }] },
                      /** @type {any} */ ({ paramRuntime: runtime })
                  )
                : new Collector();
            const formula = makeFormula(runtime);
            const output = new Collector();
            source.addChild(formula);
            formula.addChild(output);
            formula.initialize();
            if (source instanceof InlineSource) {
                source.loadSynchronously();
            } else {
                publish(source);
            }
            // Row failures may occur inside async load() wrappers unless replay
            // uses the source's synchronous publication capability.
            const handle = vi.spyOn(formula, "handle");
            handle.mockImplementationOnce(() => {
                throw new Error("bad row");
            });
            const seen = vi.fn();
            runtime.effect(
                runtime.createExpression("factor").dependencies,
                seen
            );
            runtime.runInTransaction(() => runtime.setValue("factor", 2));
            const failed = expect(runtime.whenPropagated()).rejects.toThrow(
                "bad row"
            );
            expect(() => runtime.flushNow()).toThrow("bad row");
            await failed;
            expect(seen).not.toHaveBeenCalled();
            runtime.setValue("factor", 3);
            expect(seen).toHaveBeenCalledTimes(1);
            expect(Array.from(output.getData(), (d) => d.y)).toEqual(
                inline ? [3] : [3, 6, 9]
            );
        }
    );
    test("dispatching an async reload does not subsume cached descendant replay", async () => {
        const runtime = makeRuntime();
        const source = new DataSource(
            /** @type {any} */ ({ paramRuntime: runtime })
        );
        const filter = makeFilter(runtime);
        const cached = new Collector();
        const formula = makeFormula(runtime);
        const output = new Collector();
        source.addChild(filter);
        filter.addChild(cached);
        cached.addChild(formula);
        formula.addChild(output);
        filter.initialize();
        formula.initialize();
        for (const x of [1, 2, 3]) filter.handle({ x });
        source.complete();
        const request = vi.spyOn(source, "load");
        const replay = vi.spyOn(cached, "repropagate");
        runtime.runInTransaction(() => {
            runtime.setValue("factor", 10);
            runtime.setValue("lower", 2);
        });
        await runtime.whenPropagated();
        expect(request).toHaveBeenCalledTimes(1);
        expect(replay).toHaveBeenCalledTimes(1);
        // A reload request has not published new rows: existing cached output
        // still needs the changed formula while asynchronous data is pending.
        expect(Array.from(output.getData(), (d) => d.y)).toEqual([10, 20, 30]);
    });
});
