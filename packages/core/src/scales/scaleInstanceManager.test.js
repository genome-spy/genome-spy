import { afterEach, describe, expect, test, vi } from "vitest";

import ScaleInstanceManager from "./scaleInstanceManager.js";
import Genome from "../genome/genome.js";
import GenomeStore from "../genome/genomeStore.js";
import "./scaleResolution.js";

describe("ScaleInstanceManager", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("creates scale and notifies on range changes", () => {
        const onRangeChange = vi.fn();
        const exprFn = /** @type {any} */ (() => 0);
        const manager = new ScaleInstanceManager({
            getParamRuntime: () =>
                /** @type {any} */ ({
                    createExpression: () => exprFn,
                }),
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
        expr.subscribe = (/** @type {() => void} */ fn) => {
            listener = fn;
            return () => {
                listener = undefined;
            };
        };
        expr.invalidate = /** @returns {void} */ () => undefined;

        // Non-obvious: stub expression function to avoid vega-expression in unit tests.
        const manager = new ScaleInstanceManager({
            getParamRuntime: () =>
                /** @type {any} */ ({
                    createExpression: () => expr,
                }),
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

    test("domain changes notify listeners", () => {
        const onDomainChange = vi.fn();
        const manager = new ScaleInstanceManager({
            getParamRuntime: () =>
                /** @type {any} */ ({
                    createExpression: () => /** @type {any} */ (() => 0),
                }),
            onRangeChange: /** @returns {void} */ () => undefined,
            onDomainChange,
        });

        const scale = manager.createScale({
            type: "linear",
            domain: [0, 1],
            range: [0, 1],
        });

        scale.domain([1, 2]);
        expect(onDomainChange).toHaveBeenCalled();
    });

    test("binds a genome when creating locus scales", async () => {
        const genomeStore = new GenomeStore(".");
        await genomeStore.initialize({
            name: "test",
            contigs: [{ name: "chr1", size: 10 }],
        });

        const manager = new ScaleInstanceManager({
            getParamRuntime: () =>
                /** @type {any} */ ({
                    createExpression: () => /** @type {any} */ (() => 0),
                }),
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
            getParamRuntime: () =>
                /** @type {any} */ ({
                    createExpression: () => /** @type {any} */ (() => 0),
                }),
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
            getParamRuntime: () =>
                /** @type {any} */ ({
                    createExpression: () => /** @type {any} */ (() => 0),
                }),
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

    test("loads built-in assembly lazily when requested by locus scale", () => {
        const genomeStore = new GenomeStore(".");
        const manager = new ScaleInstanceManager({
            getParamRuntime: () =>
                /** @type {any} */ ({
                    createExpression: () => /** @type {any} */ (() => 0),
                }),
            onRangeChange: /** @returns {void} */ () => undefined,
            getGenomeStore: () => genomeStore,
        });

        const scale = manager.createScale({
            type: "locus",
            domain: [0, 1],
            range: [0, 1],
            assembly: "hg19",
        });

        const locusScale =
            /** @type {import("../genome/scaleLocus.js").ScaleLocus} */ (scale);
        expect(locusScale.genome().name).toBe("hg19");
        expect(genomeStore.genomes.has("hg19")).toBe(true);
    });

    test("supports inline contigs in scale assembly", () => {
        const genomeStore = new GenomeStore(".");
        const manager = new ScaleInstanceManager({
            getParamRuntime: () =>
                /** @type {any} */ ({
                    createExpression: () => /** @type {any} */ (() => 0),
                }),
            onRangeChange: /** @returns {void} */ () => undefined,
            getGenomeStore: () => genomeStore,
        });

        const scale = manager.createScale({
            type: "locus",
            domain: [0, 1],
            range: [0, 1],
            assembly: {
                contigs: [{ name: "chrA", size: 10 }],
            },
        });

        const locusScale =
            /** @type {import("../genome/scaleLocus.js").ScaleLocus} */ (scale);
        expect(locusScale.genome().getExtent()).toEqual([0, 10]);
    });

    test("supports inline url in scale assembly after ensure", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            /** @type {any} */ ({
                ok: true,
                text: async () => "chr1\t10\n",
            })
        );

        const genomeStore = new GenomeStore("https://example.org/base/");
        const inlineAssembly = /** @type {const} */ ({
            url: "inline.chrom.sizes",
        });
        await genomeStore.ensureAssembly(inlineAssembly);

        const manager = new ScaleInstanceManager({
            getParamRuntime: () =>
                /** @type {any} */ ({
                    createExpression: () => /** @type {any} */ (() => 0),
                }),
            onRangeChange: /** @returns {void} */ () => undefined,
            getGenomeStore: () => genomeStore,
        });

        const scale = manager.createScale({
            type: "locus",
            domain: [0, 1],
            range: [0, 1],
            assembly: inlineAssembly,
        });

        const locusScale =
            /** @type {import("../genome/scaleLocus.js").ScaleLocus} */ (scale);
        expect(locusScale.genome().getExtent()).toEqual([0, 10]);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("throws when inline url assembly has not been ensured", () => {
        const genomeStore = new GenomeStore(".");
        const manager = new ScaleInstanceManager({
            getParamRuntime: () =>
                /** @type {any} */ ({
                    createExpression: () => /** @type {any} */ (() => 0),
                }),
            onRangeChange: /** @returns {void} */ () => undefined,
            getGenomeStore: () => genomeStore,
        });

        expect(() =>
            manager.createScale({
                type: "locus",
                domain: [0, 1],
                range: [0, 1],
                assembly: {
                    url: "inline.chrom.sizes",
                },
            })
        ).toThrow("Inline URL assemblies must be loaded first.");
    });

    test("dispose invalidates active range expressions", () => {
        const invalidate = vi.fn();
        const expr = /** @type {any} */ (() => 1);
        expr.subscribe = (
            /** @type {() => void} */
            _listener
        ) => /** @type {() => void} */ (() => undefined);
        expr.invalidate = invalidate;

        const manager = new ScaleInstanceManager({
            getParamRuntime: () =>
                /** @type {any} */ ({
                    createExpression: () => expr,
                }),
            onRangeChange: /** @returns {void} */ () => undefined,
        });

        manager.createScale(
            /** @type {import("../spec/scale.js").Scale} */ ({
                type: "linear",
                domain: [0, 1],
                range: /** @type {any} */ ([{ expr: "value" }, 10]),
            })
        );

        manager.dispose();

        expect(invalidate).toHaveBeenCalledTimes(1);
    });
});
