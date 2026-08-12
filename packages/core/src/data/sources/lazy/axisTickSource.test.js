import { describe, expect, test, vi } from "vitest";

import Collector from "../../collector.js";
import ViewParamRuntime from "../../../paramRuntime/viewParamRuntime.js";
import AxisTickSource from "./axisTickSource.js";

/**
 * @param {object} options
 * @param {number} options.axisLength
 * @param {string} [options.scaleType]
 * @param {import("../../../genome/genome.js").default} [options.genome]
 */
function createViewStub({ axisLength, scaleType = "linear", genome }) {
    /** @type {(() => void) | undefined} */
    let lastDomainListener;

    const scale = /** @type {any} */ ((/** @type {number} */ value) => value);
    scale.type = scaleType;
    scale.domain = () => [0, 100];
    scale.range = () => [0, axisLength];
    scale.ticks = (/** @type {number | undefined} */ count) =>
        Array.from({ length: count ?? 10 }, (_, index) => index);
    scale.tickFormat = () => (/** @type {number} */ value) => String(value);
    if (genome) {
        scale.genome = () => genome;
    }

    const scaleResolution = {
        addEventListener: (
            /** @type {string} */ type,
            /** @type {() => void} */ listener
        ) => {
            if (type == "domain") {
                lastDomainListener = listener;
            }
        },
        removeEventListener: (
            /** @type {string} */ type,
            /** @type {() => void} */ listener
        ) => {
            if (type == "domain" && lastDomainListener === listener) {
                lastDomainListener = undefined;
            }
        },
        getAxisLength: () => axisLength,
        getDomain: () => [0, 100],
        getScale: () => scale,
    };

    const paramRuntime = new ViewParamRuntime(
        () => undefined,
        () => /** @type {any} */ (scaleResolution)
    );

    return {
        getDomainListener: () => lastDomainListener,
        paramRuntime,
        view: {
            paramRuntime,
            getScaleResolution: () => scaleResolution,
            isVisible: () => true,
            context: {
                addBroadcastListener: /** @returns {undefined} */ () =>
                    undefined,
                removeBroadcastListener: /** @returns {undefined} */ () =>
                    undefined,
                animator: {
                    requestRender: /** @returns {undefined} */ () => undefined,
                },
                dataFlow: {
                    loadingStatusRegistry: {
                        set: /** @returns {undefined} */ () => undefined,
                    },
                },
            },
        },
    };
}

describe("AxisTickSource", () => {
    test("evaluates tickCount ExprRefs with axisLength", async () => {
        const { view } = createViewStub({ axisLength: 160 });
        const source = new AxisTickSource(
            {
                type: "axisTicks",
                channel: "x",
                axis: { tickCount: { expr: "axisLength / 20" } },
            },
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        source.addChild(collector);

        await source.load();

        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            0, 1, 2, 3, 4, 5, 6, 7,
        ]);
    });

    test("does not synthesize an adaptive count without tickCount", async () => {
        const { view } = createViewStub({ axisLength: 160 });
        const source = new AxisTickSource(
            {
                type: "axisTicks",
                channel: "x",
                axis: {},
            },
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        source.addChild(collector);

        await source.load();

        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        ]);
    });

    test("adds chromosome labels only to locus ticks", async () => {
        const genome = /** @type {any} */ ({
            toChromosome: (/** @type {number} */ value) => ({
                name: value < 2 ? "long_contig_name" : "chr2",
            }),
        });
        const { view: locusView } = createViewStub({
            axisLength: 100,
            scaleType: "locus",
            genome,
        });
        const locusSource = new AxisTickSource(
            {
                type: "axisTicks",
                channel: "x",
                axis: { values: [1, 2] },
            },
            /** @type {any} */ (locusView)
        );
        const locusCollector = new Collector();
        locusSource.addChild(locusCollector);

        const { view: linearView } = createViewStub({ axisLength: 100 });
        const linearSource = new AxisTickSource(
            {
                type: "axisTicks",
                channel: "x",
                axis: { values: [1, 2] },
            },
            /** @type {any} */ (linearView)
        );
        const linearCollector = new Collector();
        linearSource.addChild(linearCollector);

        await locusSource.load();
        await linearSource.load();

        expect([...locusCollector.getData()]).toEqual([
            { value: 1, label: "1", chromLabel: "long_contig_name" },
            { value: 2, label: "2", chromLabel: "chr2" },
        ]);
        expect([...linearCollector.getData()]).toEqual([
            { value: 1, label: "1" },
            { value: 2, label: "2" },
        ]);
    });

    test("adds visible extraValues to continuous scale ticks", async () => {
        const { view } = createViewStub({ axisLength: 100 });
        const source = new AxisTickSource(
            {
                type: "axisTicks",
                channel: "x",
                axis: { tickCount: 5, extraValues: [2, 50, 101] },
            },
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        source.addChild(collector);

        await source.load();

        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            0, 1, 2, 3, 4, 50,
        ]);
    });

    test("ignores extraValues on discrete scales", async () => {
        const { view } = createViewStub({
            axisLength: 100,
            scaleType: "band",
        });
        const source = new AxisTickSource(
            {
                type: "axisTicks",
                channel: "x",
                axis: { tickCount: 5, extraValues: [50] },
            },
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        source.addChild(collector);

        await source.load();

        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            0, 1, 2, 3, 4,
        ]);
    });

    test("values take precedence over extraValues", async () => {
        const { view } = createViewStub({ axisLength: 100 });
        const source = new AxisTickSource(
            {
                type: "axisTicks",
                channel: "x",
                axis: { values: [10, 20], extraValues: [50] },
            },
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        source.addChild(collector);

        await source.load();

        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            10, 20,
        ]);
    });

    test("updates ticks when a tickCount expression dependency changes", async () => {
        const { paramRuntime, view } = createViewStub({ axisLength: 160 });
        const setSpacing = paramRuntime.allocateSetter("spacing", 40);
        const source = new AxisTickSource(
            {
                type: "axisTicks",
                channel: "x",
                axis: { tickCount: { expr: "axisLength / spacing" } },
            },
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        source.addChild(collector);

        await source.load();
        setSpacing(20);
        await paramRuntime.whenPropagated();

        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            0, 1, 2, 3, 4, 5, 6, 7,
        ]);
    });

    test("does not propagate unchanged ticks on domain events", async () => {
        const { getDomainListener, view } = createViewStub({
            axisLength: 160,
        });
        const source = new AxisTickSource(
            {
                type: "axisTicks",
                channel: "x",
                axis: {},
            },
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        source.addChild(collector);
        const onDomainChangedSpy = vi.spyOn(source, "onDomainChanged");

        source.activate();
        await source.load();
        onDomainChangedSpy.mockClear();
        const resetSpy = vi.spyOn(collector, "reset");
        getDomainListener()?.();

        expect(onDomainChangedSpy).toHaveBeenCalledOnce();
        expect(resetSpy).not.toHaveBeenCalled();
    });

    test("removes domain listeners on dispose", () => {
        const { getDomainListener, view } = createViewStub({
            axisLength: 160,
        });
        const source = new AxisTickSource(
            {
                type: "axisTicks",
                channel: "x",
                axis: { tickCount: { expr: "axisLength / 20" } },
            },
            /** @type {any} */ (view)
        );
        source.activate();
        const domainListener = getDomainListener();

        source.dispose();

        expect(getDomainListener()).toBeUndefined();
        expect(() => domainListener()).not.toThrow();
    });
});
