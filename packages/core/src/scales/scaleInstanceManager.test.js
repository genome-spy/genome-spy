import { describe, expect, test, vi } from "vitest";

import ScaleInstanceManager from "./scaleInstanceManager.js";
import Genome from "../genome/genome.js";
import GenomeStore from "../genome/genomeStore.js";
import "./scaleResolution.js";

describe("ScaleInstanceManager", () => {
    test("creates scale and notifies on range changes", () => {
        const onRangeChange = vi.fn();
        const exprFn = /** @type {any} */ (() => 0);
        const manager = new ScaleInstanceManager({
            getParamMediator: () =>
                /** @type {import("../view/paramMediator.js").default} */ (
                    /** @type {unknown} */ ({
                        createExpression: () => exprFn,
                    })
                ),
            onRangeChange,
        });

        const scale = manager.createScale({
            type: "linear",
            domain: [0, 1],
            range: [0, 10],
        });

        expect(scale.range()).toEqual([0, 10]);
        expect(onRangeChange).toHaveBeenCalled();

        scale.range([0, 5]);
        expect(scale.range()).toEqual([0, 5]);
        expect(onRangeChange).toHaveBeenCalledTimes(2);
    });

    test("range expression updates on parameter changes", () => {
        let current = 1;
        /** @type {(() => void) | undefined} */
        let listener;
        const expr = /** @type {any} */ (() => current);
        expr.addListener = (/** @type {() => void} */ fn) => {
            listener = fn;
        };
        expr.invalidate = /** @returns {void} */ () => undefined;

        // Non-obvious: stub expression function to avoid vega-expression in unit tests.
        const manager = new ScaleInstanceManager({
            getParamMediator: () =>
                /** @type {import("../view/paramMediator.js").default} */ (
                    /** @type {unknown} */ ({
                        createExpression: () => expr,
                    })
                ),
            onRangeChange: /** @returns {void} */ () => undefined,
        });

        const scale = manager.createScale(
            /** @type {import("../spec/scale.js").Scale} */ ({
                type: "linear",
                domain: [0, 1],
                range: /** @type {any} */ ([{ expr: "value" }, 10]),
            })
        );

        expect(scale.range()[0]).toBe(1);

        current = 5;
        listener?.();
        expect(scale.range()[0]).toBe(5);
    });

    test("binds a genome when creating locus scales", async () => {
        const genomeStore = new GenomeStore(".");
        await genomeStore.initialize({
            name: "test",
            contigs: [{ name: "chr1", size: 10 }],
        });

        const manager = new ScaleInstanceManager({
            getParamMediator: () =>
                /** @type {import("../view/paramMediator.js").default} */ (
                    /** @type {unknown} */ ({
                        createExpression: () => /** @type {any} */ (() => 0),
                    })
                ),
            onRangeChange: /** @returns {void} */ () => undefined,
            getGenomeStore: () => genomeStore,
        });

        const scale = manager.createScale({
            type: "locus",
            domain: [0, 1],
            range: [0, 1],
        });

        const locusScale =
            /** @type {import("../genome/scaleLocus.js").ScaleLocus} */ (scale);
        expect(locusScale.genome()).toBe(genomeStore.getGenome());
    });

    test("uses assembly override for locus scales", async () => {
        const genomeStore = new GenomeStore(".");
        await genomeStore.initialize({
            name: "default",
            contigs: [{ name: "chr1", size: 10 }],
        });
        // Non-obvious: add a second genome directly for assembly override tests.
        const altGenome = new Genome({
            name: "alt",
            contigs: [{ name: "chr1", size: 5 }],
        });
        genomeStore.genomes.set(altGenome.name, altGenome);

        const manager = new ScaleInstanceManager({
            getParamMediator: () =>
                /** @type {import("../view/paramMediator.js").default} */ (
                    /** @type {unknown} */ ({
                        createExpression: () => /** @type {any} */ (() => 0),
                    })
                ),
            onRangeChange: /** @returns {void} */ () => undefined,
            getGenomeStore: () => genomeStore,
        });

        const scale = manager.createScale({
            type: "locus",
            domain: [0, 1],
            range: [0, 1],
            assembly: "alt",
        });

        const locusScale =
            /** @type {import("../genome/scaleLocus.js").ScaleLocus} */ (scale);
        expect(locusScale.genome()).toBe(altGenome);
    });

    test("throws when locus assembly is missing", async () => {
        const genomeStore = new GenomeStore(".");
        await genomeStore.initialize({
            name: "default",
            contigs: [{ name: "chr1", size: 10 }],
        });

        const manager = new ScaleInstanceManager({
            getParamMediator: () =>
                /** @type {import("../view/paramMediator.js").default} */ (
                    /** @type {unknown} */ ({
                        createExpression: () => /** @type {any} */ (() => 0),
                    })
                ),
            onRangeChange: /** @returns {void} */ () => undefined,
            getGenomeStore: () => genomeStore,
        });

        expect(() =>
            manager.createScale({
                type: "locus",
                domain: [0, 1],
                range: [0, 1],
                assembly: "missing",
            })
        ).toThrow("No genome with the name missing has been configured!");
    });
});
