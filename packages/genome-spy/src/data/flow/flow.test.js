import FilterTransform from "../flowTransforms/filter";
import FormulaTransform from "../flowTransforms/formula";
import Collector from "./collector";
import SequenceSource from "./sequenceSource";

describe("Test flow graphs", () => {
    test("Trivial graph: sequence to collector", () => {
        const source = new SequenceSource({ start: 0, stop: 5 });
        const collector = new Collector();
        source.addChild(collector);

        source.complete();

        expect(collector.data).toEqual(
            [0, 1, 2, 3, 4].map(d => ({
                data: d
            }))
        );
    });

    test("Trivial branching: sequence to two collectors", () => {
        const source = new SequenceSource({ start: 0, stop: 5 });
        const collector1 = new Collector();
        source.addChild(collector1);
        const collector2 = new Collector();
        source.addChild(collector2);

        source.complete();

        expect(collector1.data).not.toBe(collector2.data);

        expect(collector1.data).toEqual(
            [0, 1, 2, 3, 4].map(d => ({
                data: d
            }))
        );

        expect(collector2.data).toEqual(
            [0, 1, 2, 3, 4].map(d => ({
                data: d
            }))
        );
    });

    test("Longer chain of nodes", () => {
        const source = new SequenceSource({ start: 0, stop: 10 });
        const filter = new FilterTransform({
            type: "filter",
            expr: "datum.data < 5"
        });
        const formula = new FormulaTransform({
            type: "formula",
            expr: "datum.data * 2",
            as: "data"
        });
        const collector = new Collector();

        source.addChild(filter);
        filter.addChild(formula);
        formula.addChild(collector);

        source.complete();

        expect(collector.data).toEqual(
            [0, 2, 4, 6, 8].map(d => ({
                data: d
            }))
        );
    });
});
