import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";

import { registerLazyDataSource } from "../data/sources/dataSourceFactory.js";
import SingleAxisLazySource from "../data/sources/lazy/singleAxisLazySource.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { getRequiredScaleResolution } from "./scaleResolutionTestUtils.js";

/**
 * @typedef {import("../data/sources/inlineSource.js").default} InlineSource
 * @typedef {import("../view/concatView.js").default} ConcatView
 */

/** @type {(() => void)[]} */
let disposers = [];

afterEach(() => {
    for (const dispose of disposers.reverse()) {
        dispose();
    }
    disposers = [];
    vi.useRealTimers();
    vi.restoreAllMocks();
});

/**
 * Real lazy publication with test-controlled completion order, without timers
 * or remote data. The inherited startup load still emits its dummy completion.
 */
class ControlledSource extends SingleAxisLazySource {
    /**
     * @param {object} params
     * @param {import("../view/view.js").default} view
     */
    constructor(params, view) {
        super(view, "x");
    }

    onDomainChanged() {
        // The test decides when data for a requested interval arrive.
    }

    /**
     * @param {import("../data/flowNode.js").Datum[]} rows
     * @param {number[]} interval
     */
    publish(rows, interval) {
        this.publishData([rows], interval);
    }
}

function registerControlledSource() {
    disposers.push(
        registerLazyDataSource(
            (params) => /** @type {any} */ (params).type === "lifecycleTest",
            ControlledSource
        )
    );
}

/**
 * @param {string} path
 * @returns {import("../spec/root.js").RootSpec}
 */
function readExample(path) {
    return JSON.parse(
        readFileSync(
            new URL("../../../../examples/" + path, import.meta.url),
            "utf8"
        )
    );
}

/** @param {import("../spec/root.js").RootSpec} spec */
async function createExample(spec) {
    const { view } = await createHeadlessEngine(spec);
    disposers.push(() => view.disposeSubtree());
    return view;
}

describe("example scale-domain lifecycle contracts", () => {
    test("a pending coordinate lookup and a ready-empty lookup both complete an empty collector", async () => {
        registerControlledSource();
        // Dynseq's primary sequence can finish before its BigWig lookup. A
        // completed collector alone cannot establish side-input readiness.
        const view = await createExample({
            data: { values: [{ x: 0 }, { x: 1 }] },
            transform: [
                {
                    type: "coordinateLookup",
                    from: {
                        data: {
                            lazy: /** @type {any} */ ({
                                type: "lifecycleTest",
                            }),
                        },
                    },
                    key: "x",
                    values: ["score"],
                },
                { type: "filter", expr: "isValid(datum.score)" },
            ],
            mark: "rule",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 1] },
                },
                y: { datum: 0, type: "quantitative" },
                y2: { field: "score" },
            },
        });
        const source = view.context.dataFlow.dataSources.find(
            (source) => source instanceof ControlledSource
        );
        const collector = view.flowHandle.collector;
        expect(collector.completed).toBe(true);
        expect(collector.getData()).toEqual([]);
        expect(source.isDataReadyForDomain({ x: [0, 1] })).toBe(false);

        source.publish([], [0, 1]);
        expect(collector.completed).toBe(true);
        expect(collector.getData()).toEqual([]);
        expect(source.isDataReadyForDomain({ x: [0, 1] })).toBe(true);

        source.publish([{ x: 0, score: 6 }], [0, 1]);
        expect(getRequiredScaleResolution(view, "y").getDomain()).toEqual([
            0, 6,
        ]);
    });

    test("MSA-style shared index scales keep reset bounds separate from changing data extent", async () => {
        registerControlledSource();
        // msa.json starts with this configured interval and a full-data zoom
        // extent. Separate sources let us deliver shared contributors in order.
        const view = await createExample({
            scales: { x: { domain: [190, 230], zoom: { extent: "data" } } },
            resolve: { scale: { x: "shared" } },
            vconcat: [0, 1].map(() => ({
                data: { lazy: /** @type {any} */ ({ type: "lifecycleTest" }) },
                mark: "point",
                encoding: { x: { field: "pos", type: "index" } },
            })),
        });
        const sources = view.context.dataFlow.dataSources.filter(
            (source) => source instanceof ControlledSource
        );
        const x = getRequiredScaleResolution(view, "x");
        expect(x.getDomain()).toEqual([190, 231]);

        sources[0].publish([{ pos: 190 }, { pos: 230 }], [190, 231]);
        sources[1].publish([{ pos: 0 }, { pos: 399 }], [0, 400]);
        expect(x.getDomain()).toEqual([190, 231]);
        expect(x.zoomExtent).toEqual([0, 400]);

        await x.zoomTo([200, 210]);
        sources[1].publish([{ pos: 0 }, { pos: 499 }], [0, 500]);
        expect(x.getDomain()).toEqual([200, 211]);
        expect(x.zoomExtent).toEqual([0, 500]);

        expect(x.resetZoom()).toBe(true);
        expect(x.getDomain()).toEqual([190, 231]);
        expect(x.zoomExtent).toEqual([0, 500]);
        expect(x.isZoomed()).toBe(false);
    });

    test("late shared data and an empty contributor cannot undo early navigation", async () => {
        registerControlledSource();
        const view = await createExample({
            scales: { x: { zoom: true } },
            resolve: { scale: { x: "shared" } },
            layer: [0, 1, 2].map(() => ({
                data: { lazy: /** @type {any} */ ({ type: "lifecycleTest" }) },
                mark: "point",
                encoding: { x: { field: "x", type: "quantitative" } },
            })),
        });
        const sources = view.context.dataFlow.dataSources.filter(
            (source) => source instanceof ControlledSource
        );
        const x = getRequiredScaleResolution(view, "x");
        sources[0].publish([{ x: 0 }, { x: 10 }], [0, 10]);
        await x.zoomTo([2, 4]);

        const notified = vi.fn();
        x.addEventListener("domain", notified);
        sources[1].publish([{ x: 0 }, { x: 30 }], [0, 30]);
        sources[2].publish([], [0, 30]);
        expect(x.getDomain()).toEqual([2, 4]);
        expect(Array.from(x.getDataDomain())).toEqual([0, 30]);
        expect(notified).not.toHaveBeenCalled();
    });

    test("initialized zoomable domains survive data refresh even without navigation", async () => {
        const view = await createExample({
            data: { values: [{ x: 0 }, { x: 10 }] },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative", scale: { zoom: true } },
            },
        });
        const x = getRequiredScaleResolution(view, "x");
        const source = /** @type {InlineSource} */ (view.flowHandle.dataSource);
        const notified = vi.fn();
        x.addEventListener("domain", notified);

        source.updateDynamicData([{ x: 0 }, { x: 40 }]);
        expect(Array.from(x.getDataDomain())).toEqual([0, 40]);
        expect(x.getDomain()).toEqual([0, 10]);
        expect(notified).not.toHaveBeenCalled();
    });

    test("two-way linking preserves selection through data refresh and clears to the new fallback", async () => {
        const spec = readExample(
            "core/selection/interval_linked_domain_two_way.json"
        );
        // Keep the real overview/detail and push:outer structure. Inline data
        // makes a later data refresh controllable, and initial exercises clearing.
        spec.data = { values: [{ x: 0 }, { x: 50 }, { x: 100 }] };
        const detailSpec = /** @type {import("../spec/view.js").UnitSpec} */ (
            /** @type {import("../spec/view.js").VConcatSpec} */ (spec)
                .vconcat[1]
        );
        /** @type {import("../spec/channel.js").PositionFieldDef} */ (
            detailSpec.encoding.x
        ).scale.domain = { param: "brush", initial: [20, 40] };
        const view = /** @type {ConcatView} */ (await createExample(spec));
        const x = getRequiredScaleResolution(view.children[1], "x");
        const overview = getRequiredScaleResolution(view.children[0], "x");
        const source = /** @type {InlineSource} */ (view.flowHandle.dataSource);

        expect(x.getDomain()).toEqual([20, 40]);
        await x.zoomTo([30, 50]);
        expect(view.paramRuntime.getValue("brush").intervals.x).toEqual([
            30, 50,
        ]);

        source.updateDynamicData([{ x: 0 }, { x: 100 }, { x: 200 }]);
        expect(x.getDomain()).toEqual([30, 50]);
        expect(overview.getDomain()).toEqual([0, 200]);

        view.paramRuntime.setValue("brush", {
            type: "interval",
            intervals: { x: null },
        });
        expect(x.getDomain()).toEqual([0, 200]);
        expect(view.paramRuntime.getValue("brush").intervals.x).toBeNull();
    });

    test("viewport autoscaling debounces navigation and retains its last nonempty domain", async () => {
        const spec = readExample("docs/grammar/scale/viewport-autoscale.json");
        // Preserve the example's zoomable x and viewport-derived y, replacing
        // its large random signal with deterministic points and a genuine gap.
        spec.data = {
            values: [
                { x: 0, y: 2 },
                { x: 1, y: 8 },
                { x: 100, y: 20 },
            ],
        };
        delete spec.transform;
        const view = await createExample(spec);
        const x = getRequiredScaleResolution(view, "x");
        const y = getRequiredScaleResolution(view, "y");
        const notified = vi.fn();
        y.addEventListener("domain", notified);
        vi.useFakeTimers();

        await x.zoomTo([0, 2]);
        await vi.advanceTimersByTimeAsync(149);
        expect(y.getDomain()).toEqual([0, 20]);
        await vi.advanceTimersByTimeAsync(1);
        expect(y.getDomain()).toEqual([0, 8]);
        expect(notified).toHaveBeenCalledTimes(1);

        notified.mockClear();
        await x.zoomTo([30, 40]);
        await vi.advanceTimersByTimeAsync(150);
        expect(y.getDomain()).toEqual([0, 8]);
        expect(notified).not.toHaveBeenCalled();
        expect(x.getDomain()).toEqual([30, 40]);
    });
});
