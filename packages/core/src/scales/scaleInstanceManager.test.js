import { afterEach, describe, expect, test, vi } from "vitest";

import createVegaScale from "../scale/scale.js";
import ScaleInstanceManager from "./scaleInstanceManager.js";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import Genome from "../genome/genome.js";
import GenomeStore from "../genome/genomeStore.js";
import "./scaleResolution.js";

/** @type {Map<ScaleInstanceManager, ViewParamRuntime>} */
const runtimes = new Map();

/** @param {Omit<ConstructorParameters<typeof ScaleInstanceManager>[0], "getRuntime" | "createExpression"> & {runtime?: ViewParamRuntime}} options */
function createManager({ runtime = new ViewParamRuntime(), ...options }) {
    const manager = new ScaleInstanceManager({
        ...options,
        getRuntime: () => runtime,
        createExpression: (expr) => runtime.createExpression(expr),
    });
    runtimes.set(manager, runtime);
    return manager;
}

/**
 * Isolate physical scale configuration from the domain owner's startup work.
 * @param {ScaleInstanceManager} manager
 * @param {import("../spec/scale.js").Scale} props
 */
function createScale(manager, props) {
    return manager.createScale(props, (domain) =>
        runtimes.get(manager).signal("domain", domain)
    );
}

describe("ScaleInstanceManager", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        for (const [manager, runtime] of runtimes) {
            manager.dispose();
            runtime.dispose();
        }
        runtimes.clear();
    });

    test("creates scale and notifies on range changes", () => {
        const onRangeChange = vi.fn();
        const manager = createManager({
            onRangeChange,
            onDomainChange: () => {},
            getGenomeStore: () => undefined,
        });

        const scale = createScale(manager, {
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

    test("preserves the full scheme interpolator when applying mapping properties", () => {
        const manager = createManager({
            onRangeChange: () => {},
            onDomainChange: () => {},
            getGenomeStore: () => undefined,
        });
        const props = /** @type {import("../spec/scale.js").Scale} */ ({
            type: "linear",
            domain: [0, 1],
            scheme: "viridis",
        });
        const scale = createScale(manager, props);
        const reference = createVegaScale(props);
        expect([0, 0.25, 0.5, 0.75, 1].map(scale)).toEqual(
            [0, 0.25, 0.5, 0.75, 1].map(reference)
        );
    });

    test("range expression updates on parameter changes", () => {
        const runtime = new ViewParamRuntime();
        const setValue = runtime.registerParam({ name: "value", value: 1 });
        const manager = createManager({
            runtime,
            onRangeChange: () => {},
            onDomainChange: () => {},
            getGenomeStore: () => undefined,
        });

        const scale = createScale(
            manager,
            /** @type {import("../spec/scale.js").Scale} */ ({
                type: "linear",
                domain: [0, 1],
                range: /** @type {any} */ ([{ expr: "value" }, 10]),
            })
        );

        expect(scale.range()[0]).toBe(1);

        setValue(5);
        runtime.flushNow();
        expect(scale.range()[0]).toBe(5);
    });

    test("domain writes delegate to the owner before changing the physical scale", () => {
        const onDomainChange = vi.fn();
        const manager = createManager({
            onRangeChange: /** @returns {void} */ () => undefined,
            onDomainChange,
            getGenomeStore: () => undefined,
        });

        const scale = createScale(manager, {
            type: "linear",
            domain: [0, 1],
            range: [0, 1],
        });

        expect(scale.domain([1, 2])).toBe(scale);
        expect(onDomainChange).toHaveBeenCalledExactlyOnceWith([1, 2]);
        expect(scale.domain()).toEqual([0, 1]);
        manager.mirrorDomain([1, 2]);
        expect(scale.domain()).toEqual([1, 2]);
    });

    test("binds a genome when creating locus scales", async () => {
        const genomeStore = new GenomeStore(".");
        await genomeStore.initialize({
            name: "test",
            contigs: [{ name: "chr1", size: 10 }],
        });

        const manager = createManager({
            onRangeChange: /** @returns {void} */ () => undefined,
            getGenomeStore: () => genomeStore,
            onDomainChange: () => {},
        });

        const scale = createScale(manager, {
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

        const manager = createManager({
            onRangeChange: /** @returns {void} */ () => undefined,
            getGenomeStore: () => genomeStore,
            onDomainChange: () => {},
        });

        const scale = createScale(manager, {
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

        const manager = createManager({
            onRangeChange: /** @returns {void} */ () => undefined,
            getGenomeStore: () => genomeStore,
            onDomainChange: () => {},
        });

        expect(() =>
            createScale(manager, {
                type: "locus",
                domain: [0, 1],
                range: [0, 1],
                assembly: "missing",
            })
        ).toThrow("No genome with the name missing has been configured!");
    });

    test("loads built-in assembly lazily when requested by locus scale", () => {
        const genomeStore = new GenomeStore(".");
        const manager = createManager({
            onRangeChange: /** @returns {void} */ () => undefined,
            getGenomeStore: () => genomeStore,
            onDomainChange: () => {},
        });

        const scale = createScale(manager, {
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
        const manager = createManager({
            onRangeChange: /** @returns {void} */ () => undefined,
            getGenomeStore: () => genomeStore,
            onDomainChange: () => {},
        });

        const scale = createScale(manager, {
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

        const manager = createManager({
            onRangeChange: /** @returns {void} */ () => undefined,
            getGenomeStore: () => genomeStore,
            onDomainChange: () => {},
        });

        const scale = createScale(manager, {
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
        const manager = createManager({
            onRangeChange: /** @returns {void} */ () => undefined,
            getGenomeStore: () => genomeStore,
            onDomainChange: () => {},
        });

        expect(() =>
            createScale(manager, {
                type: "locus",
                domain: [0, 1],
                range: [0, 1],
                assembly: {
                    url: "inline.chrom.sizes",
                },
            })
        ).toThrow("Inline URL assemblies must be loaded first.");
    });

    test("one mapping survives identity replacements and detaches old expressions", () => {
        const runtime = new ViewParamRuntime();
        const setValue = runtime.registerParam({ name: "value", value: 10 });
        const manager = createManager({
            runtime,
            onRangeChange: () => {},
            onDomainChange: () => {},
            getGenomeStore: () => undefined,
        });
        createScale(manager, {
            type: "linear",
            domain: [0, 1],
            range: [0, { expr: "value" }],
        });
        const mapping = manager.mapping;
        const changed = vi.fn();
        runtime.effect([mapping], changed);

        manager.resetScale();
        createScale(manager, /** @type {any} */ ({ type: "null" }));
        expect(manager.mapping).toBe(mapping);
        expect(changed).toHaveBeenCalledTimes(1);
        setValue(20);
        runtime.flushNow();
        expect(changed).toHaveBeenCalledTimes(1);

        manager.resetScale();
        const scale = createScale(manager, {
            type: "linear",
            domain: [0, 1],
            range: [0, 40],
        });
        expect(manager.mapping).toBe(mapping);
        expect(scale(0.5)).toBe(20);
        expect(changed).toHaveBeenCalledTimes(2);
    });

    test("ignores overridden padding changes and preserves rangeStep fallback", () => {
        const runtime = new ViewParamRuntime();
        const setPadding = runtime.registerParam({
            name: "padding",
            value: 0.2,
        });
        const changed = vi.fn();
        const manager = createManager({
            runtime,
            onRangeChange: changed,
            onDomainChange: () => {},
            getGenomeStore: () => undefined,
        });
        const props = /** @type {import("../spec/scale.js").Scale} */ ({
            type: "band",
            domain: ["a", "b"],
            rangeStep: 10,
            padding: { expr: "padding" },
            paddingInner: 0.1,
            paddingOuter: 0.3,
        });
        const scale = /** @type {import("d3-scale").ScaleBand<string>} */ (
            createScale(manager, props)
        );
        changed.mockClear();

        // Both explicit values override the changed general padding.
        setPadding(0.5);
        runtime.flushNow();
        expect(changed).not.toHaveBeenCalled();
        expect(scale.range()).toEqual([0, 25]);

        delete props.paddingInner;
        manager.configureMapping(props);
        expect(scale.paddingInner()).toBe(0.5);
        expect(scale.range()[1]).toBeCloseTo(21);
        expect(changed).toHaveBeenCalledTimes(1);

        delete props.paddingOuter;
        manager.configureMapping(props);
        expect(scale.paddingOuter()).toBe(0.5);
        setPadding(0);
        runtime.flushNow();
        expect(scale.paddingInner()).toBe(0);
        expect(scale.paddingOuter()).toBe(0);
        expect(scale.range()).toEqual([0, 20]);
    });

    test("dispose prevents pending and future range changes", () => {
        const runtime = new ViewParamRuntime();
        const setValue = runtime.registerParam({ name: "value", value: 1 });
        const manager = createManager({
            runtime,
            onRangeChange: () => {},
            onDomainChange: () => {},
            getGenomeStore: () => undefined,
        });
        const scale = createScale(manager, {
            type: "linear",
            domain: [0, 1],
            range: [{ expr: "value" }, 10],
        });
        runtime.runInTransaction(() => {
            setValue(2);
            manager.dispose();
        });
        runtime.flushNow();
        setValue(3);
        runtime.flushNow();
        expect(scale.range()).toEqual([1, 10]);
    });
});
