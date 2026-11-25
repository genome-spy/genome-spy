import { afterEach, describe, expect, test, vi } from "vitest";

import createVegaScale from "../scale/scale.js";
import ScaleInstanceManager from "./scaleInstanceManager.js";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import Genome from "../genome/genome.js";
import GenomeStore from "../genome/genomeStore.js";
import "./scaleResolution.js";

/** @type {Map<ScaleInstanceManager, ViewParamRuntime>} */
const runtimes = new Map();

/** @param {Omit<ConstructorParameters<typeof ScaleInstanceManager>[0], "channel" | "getRuntime" | "createExpression"> & {runtime?: ViewParamRuntime, channel?: import("../spec/channel.js").Channel}} options */
function createManager({ runtime = new ViewParamRuntime(), ...options }) {
    const manager = new ScaleInstanceManager({
        channel: "size",
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
        runtimes.get(manager).signal("domain state", { visibleDomain: domain })
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

    test("copies own scale options without activating a prototype option", () => {
        const manager = createManager({
            onRangeChange: () => {},
            onDomainChange: () => {},
            getGenomeStore: () => undefined,
        });
        const scale =
            /** @type {import("d3-scale").ScaleLinear<number, number>} */ (
                createScale(
                    manager,
                    JSON.parse(
                        '{"type":"linear","domain":[0,1],"__proto__":{"clamp":true}}'
                    )
                )
            );
        expect(scale.clamp()).toBe(false);
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

    test.each([
        {
            type: "linear",
            domain: [10, 20],
            names: ["viridis", "magma"],
            extent: [0.2, 0.6],
        },
        {
            type: "ordinal",
            domain: ["a", "b"],
            names: ["category10", "tableau10"],
        },
    ])(
        "updates a $type color scheme without changing the domain",
        ({ type, domain, names, extent }) => {
            const runtime = new ViewParamRuntime();
            const setScheme = runtime.registerParam({
                name: "palette",
                value: names[0],
            });
            const onRangeChange = vi.fn();
            const manager = createManager({
                runtime,
                channel: "fill",
                onRangeChange,
                onDomainChange: () => {},
                getGenomeStore: () => undefined,
            });
            const props = /** @type {import("../spec/scale.js").Scale} */ ({
                type,
                domain,
                scheme: extent
                    ? { name: { expr: "palette" }, extent }
                    : { expr: "palette" },
                reverse: true,
            });
            const scale = createScale(manager, props);
            const colors = (/** @type {string} */ name) =>
                createVegaScale({
                    ...props,
                    scheme: extent ? { name, extent } : name,
                }).range();

            expect(scale.range()).toEqual(colors(names[0]));
            onRangeChange.mockClear();
            setScheme(names[1]);
            expect(scale.range()).toEqual(colors(names[1]));
            expect(scale.domain()).toEqual(domain);
            expect(onRangeChange).toHaveBeenCalledOnce();

            expect(() => setScheme("unknown-palette")).toThrow(
                "Unrecognized scheme name: unknown-palette"
            );
            expect(() => setScheme("constructor")).toThrow(
                "Unrecognized scheme name: constructor"
            );
            expect(scale.range()).toEqual(colors(names[1]));
            expect(onRangeChange).toHaveBeenCalledOnce();
        }
    );

    test("range expression updates on parameter changes", () => {
        const runtime = new ViewParamRuntime();
        const setValue = runtime.registerParam({ name: "value", value: 1 });
        const onRangeChange = vi.fn();
        const manager = createManager({
            runtime,
            onRangeChange,
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
        onRangeChange.mockClear();

        setValue(5);
        runtime.flushNow();
        expect(scale.range()[0]).toBe(5);
        expect(onRangeChange).toHaveBeenCalledOnce();
    });

    test("ordinal range expressions reverse a copy and reject invalid updates", () => {
        const runtime = new ViewParamRuntime();
        const palette = ["red", "blue"];
        const setPalette = runtime.registerParam({
            name: "palette",
            value: palette,
        });
        const manager = createManager({
            runtime,
            channel: "fill",
            onRangeChange: () => {},
            onDomainChange: () => {},
            getGenomeStore: () => undefined,
        });
        const scale = createScale(manager, {
            type: "ordinal",
            domain: ["a", "b"],
            range: { expr: "palette" },
            reverse: true,
        });

        expect(scale.range()).toEqual(["blue", "red"]);
        expect(palette).toEqual(["red", "blue"]);

        expect(() => setPalette("green")).toThrow(
            "An ordinal scale range expression must return a non-empty array."
        );
        expect(() => setPalette([])).toThrow("must return a non-empty array");
        for (const invalid of [[false], [17], ["bogus-color"]]) {
            expect(() => setPalette(invalid)).toThrow("must be CSS colors");
        }
        expect(scale.range()).toEqual(["blue", "red"]);
    });

    test("whole-range expressions require an ordinal scale", () => {
        const manager = createManager({
            onRangeChange: () => {},
            onDomainChange: () => {},
            getGenomeStore: () => undefined,
        });

        expect(() =>
            createScale(manager, {
                type: "linear",
                domain: [0, 1],
                range: { expr: "[0, 1]" },
            })
        ).toThrow('A scale range expression requires scale type "ordinal".');
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

    test("ignores a pending mapping after reset", () => {
        const runtime = new ViewParamRuntime();
        const setRangeEnd = runtime.registerParam({
            name: "rangeEnd",
            value: 10,
        });
        const manager = createManager({
            runtime,
            onRangeChange: () => {},
            onDomainChange: () => {},
            getGenomeStore: () => undefined,
        });
        createScale(manager, {
            type: "linear",
            domain: [0, 1],
            range: [0, { expr: "rangeEnd" }],
        });

        runtime.runInTransaction(() => {
            setRangeEnd(5);
            manager.resetScale();
        });

        expect(() => runtime.flushNow()).not.toThrow();
    });

    test("keeps prior setter precedence for literal padding", () => {
        const manager = createManager({
            onRangeChange: () => {},
            onDomainChange: () => {},
            getGenomeStore: () => undefined,
        });
        const scale = /** @type {import("d3-scale").ScaleBand<string>} */ (
            createScale(manager, {
                type: "band",
                domain: ["a", "b"],
                paddingInner: 0.1,
                padding: 0.5,
            })
        );
        expect(scale.paddingInner()).toBe(0.5);
    });

    test("ignores overridden padding changes and restores reactive padding on reconfiguration", () => {
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
        expect(scale.paddingInner()).toBe(0.1);

        delete props.paddingInner;
        manager.configureMapping(props);
        expect(scale.paddingInner()).toBe(0.5);
        expect(changed).toHaveBeenCalledTimes(1);

        delete props.paddingOuter;
        manager.configureMapping(props);
        expect(scale.paddingOuter()).toBe(0.5);
        setPadding(0);
        runtime.flushNow();
        expect(scale.paddingInner()).toBe(0);
        expect(scale.paddingOuter()).toBe(0);

        setPadding(2);
        runtime.flushNow();
        expect(scale.paddingInner()).toBe(1);
        expect(scale.paddingOuter()).toBe(1);
        manager.configureMapping({ ...props, paddingOuter: 1, align: 0.25 });
        expect(scale.paddingInner()).toBe(1);
        expect(scale.paddingOuter()).toBe(1);
        expect(scale.align()).toBe(0.25);
        changed.mockClear();
        setPadding(3);
        runtime.flushNow();
        expect(changed).not.toHaveBeenCalled();
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
