import { describe, expect, test } from "vitest";
import FilterTransform from "./transforms/filter.js";
import FormulaTransform from "./transforms/formula.js";
import Collector from "./collector.js";
import {
    SynchronousSequenceSource,
    makeParamMediatorProvider,
} from "./flowTestUtils.js";

describe("Test flow graphs", () => {
    test("Trivial graph: sequence to collector", () => {
        const source = new SynchronousSequenceSource(5);
        const collector = new Collector();
        source.addChild(collector);

        source.dispatch();

        expect(collector.getData()).toEqual(
            [0, 1, 2, 3, 4].map((d) => ({
                data: d,
            }))
        );
    });

    test("Trivial branching: sequence to two collectors", () => {
        const source = new SynchronousSequenceSource(5);
        const collector1 = new Collector();
        source.addChild(collector1);
        const collector2 = new Collector();
        source.addChild(collector2);

        source.dispatch();

        expect(collector1.getData()).toEqual(
            [0, 1, 2, 3, 4].map((d) => ({
                data: d,
            }))
        );

        expect(collector2.getData()).toEqual(
            [0, 1, 2, 3, 4].map((d) => ({
                data: d,
            }))
        );
    });

    test.skip("Implement stub for ParamMediator");

    test("Longer chain of nodes", () => {
        const source = new SynchronousSequenceSource(10);
        const filter = new FilterTransform(
            {
                type: "filter",
                expr: "datum.data < 5",
            },
            makeParamMediatorProvider()
        );
        const formula = new FormulaTransform(
            {
                type: "formula",
                expr: "datum.data * 2",
                as: "data",
            },
            makeParamMediatorProvider()
        );
        const collector = new Collector();

        source.addChild(filter);
        filter.addChild(formula);
        formula.addChild(collector);

        source.visit((node) => node.initialize());
        source.dispatch();

        expect(collector.getData()).toEqual(
            [0, 2, 4, 6, 8].map((d) => ({
                data: d,
            }))
        );
    });
});
