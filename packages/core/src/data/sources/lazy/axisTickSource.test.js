import { describe, expect, test, vi } from "vitest";

import Collector from "../../collector.js";
import ViewParamRuntime from "../../../paramRuntime/viewParamRuntime.js";
import AxisTickSource from "./axisTickSource.js";

/**
 * @param {object} options
 * @param {number} options.axisLength
 * @param {string} [options.scaleType]
 */
function createViewStub({ axisLength, scaleType = "linear" }) {
    /** @type {(() => void) | undefined} */
    let lastDomainListener;

    const scale = /** @type {any} */ ((/** @type {number} */ value) => value);
    scale.type = scaleType;
    scale.domain = () => [0, 100];
    scale.range = () => [0, axisLength];
    scale.ticks = (/** @type {number | undefined} */ count) =>
        Array.from({ length: count ?? 10 }, (_, index) => index);
    scale.tickFormat = () => (/** @type {number} */ value) => String(value);

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

    test("responds to domain events after activation and load", async () => {
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
        const onDomainChangedSpy = vi.spyOn(source, "onDomainChanged");

        source.activate();
        await source.load();
        onDomainChangedSpy.mockClear();
        getDomainListener()?.();

        expect(onDomainChangedSpy).toHaveBeenCalledOnce();
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
