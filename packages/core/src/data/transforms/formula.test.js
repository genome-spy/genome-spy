import { expect, test, vi } from "vitest";
import { makeParamRuntimeProvider, processData } from "../flowTestUtils.js";
import Collector from "../collector.js";
import ViewParamRuntime from "../../paramRuntime/viewParamRuntime.js";
import FormulaTransform from "./formula.js";

test.todo("Implement stub for ParamRuntime");

test("FormulaTransform", () => {
    const data = [{ a: 2 }, { a: 3 }];

    const t = new FormulaTransform(
        {
            type: "formula",
            expr: "datum.a * 2",
            as: "b",
        },
        makeParamRuntimeProvider()
    );

    t.initialize();

    expect(processData(t, data)).toEqual([
        { a: 2, b: 4 },
        { a: 3, b: 6 },
    ]);
});

test("refreshes expression snapshots at flow boundaries", () => {
    const runtime = new ViewParamRuntime();
    runtime.registerParam({ name: "factor", value: 2 });
    const read = vi.spyOn(runtime.getParamRef("factor"), "get");
    const formula = new FormulaTransform(
        { type: "formula", expr: "datum.x * factor", as: "y" },
        { paramRuntime: runtime }
    );

    formula.initialize();
    formula.handle({ x: 1 });
    formula.handle({ x: 2 });
    expect(read).toHaveBeenCalledTimes(1);

    formula.reset();
    formula.beginBatch({ type: "file" });
    formula.beginBatch({ type: "facet", facetId: ["A"] });
    expect(read).toHaveBeenCalledTimes(4);
});

test("keeps passive parameters live between rows", () => {
    const runtime = new ViewParamRuntime();
    const setFactor = runtime.allocateSetter("factor", 1, true);
    const formula = new FormulaTransform(
        { type: "formula", expr: "datum.x * factor", as: "y" },
        { paramRuntime: runtime }
    );
    const output = new Collector();
    formula.addChild(output);
    formula.initialize();

    formula.handle({ x: 1 });
    setFactor(2);
    formula.handle({ x: 2 });
    formula.complete();

    expect(Array.from(output.getData(), (datum) => datum.y)).toEqual([1, 4]);
});
