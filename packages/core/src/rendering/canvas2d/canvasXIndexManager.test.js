import { afterEach, describe, expect, test, vi } from "vitest";
import { startPerformanceProfiler } from "../../debug/performanceProfiler.js";
import CanvasXIndexManager from "./canvasXIndexManager.js";

afterEach(() => {
    const globalObject = /** @type {Record<symbol, unknown>} */ (globalThis);
    delete globalObject[Symbol.for("genome-spy.performance-profiler")];
});

/** @param {string} field */
function accessor(field) {
    const read = (/** @type {Record<string, number>} */ datum) => datum[field];
    return Object.assign(read, {
        asNumberAccessor: () => read,
        channel: "x",
        channelDef: { field },
        constant: false,
        fields: [field],
    });
}

/** @param {number} value */
function constantEncoder(value) {
    return Object.assign(() => value, {
        branches: [],
        channelDef: { value },
        constant: true,
    });
}

/** @param {object[]} data */
function createFixture(data) {
    let domain = [400, 500];
    const scale = Object.assign((/** @type {number} */ value) => value, {
        type: "linear",
        domain: () => domain,
        range: () => [0, 1],
    });
    const xAccessor = accessor("x");
    const x = Object.assign(
        (/** @type {Record<string, number>} */ datum) =>
            scale(xAccessor(datum)),
        {
            branches: [{ accessor: xAccessor, predicate: () => true }],
            channelDef: { field: "x", buildIndex: true },
            constant: false,
            scale,
        }
    );
    const collector = { dataRevision: 0 };
    const resolution = {
        getAxisLength: () => 100,
        getScale: () => scale,
        zoomExtent: [0, 1000],
    };
    const mark = /** @type {any} */ ({
        encoders: {
            size: constantEncoder(0),
            strokeWidth: constantEncoder(0),
            x,
        },
        getType: () => "point",
        properties: { minPickingSize: 0 },
        unitView: {
            getCollector: () => collector,
            getScaleResolution: () => resolution,
            paramRuntime: { evaluateAndGet: vi.fn() },
        },
    });
    return {
        collector,
        mark,
        resolution,
        setDomain: (/** @type {[number, number]} */ next) => (domain = next),
    };
}

describe("CanvasXIndexManager", () => {
    test("builds once and narrows repeated live-domain queries", () => {
        const data = Array.from({ length: 1000 }, (_, x) => ({ x }));
        const fixture = createFixture(data);
        const manager = new CanvasXIndexManager();
        const profiler = startPerformanceProfiler();
        const range = /** @type {[number, number]} */ ([0, 0]);

        expect(manager.prepare(fixture.mark)).toBe(true);
        expect(manager.query(data, range)).toBe(true);
        expect(range[0]).toBeGreaterThan(300);
        expect(range[1]).toBeLessThan(600);
        const firstRange = Array.from(range);

        fixture.setDomain([800, 810]);
        expect(manager.prepare(fixture.mark)).toBe(true);
        expect(manager.query(data, range)).toBe(true);
        expect(range[0]).toBeGreaterThan(firstRange[0]);
        expect(profiler.snapshot().countTotals).toMatchObject({
            canvasXIndexBuilds: 1,
            canvasXIndexQueries: 2,
            canvasXIndexNativeItems: 2000,
        });
        expect(
            profiler.snapshot().countTotals.canvasXIndexCandidateItems
        ).toBeLessThan(1000);
    });

    test("rebuilds when collector data changes", () => {
        const data = Array.from({ length: 100 }, (_, x) => ({ x }));
        const fixture = createFixture(data);
        const manager = new CanvasXIndexManager();
        const profiler = startPerformanceProfiler();
        const range = /** @type {[number, number]} */ ([0, 0]);

        manager.prepare(fixture.mark);
        manager.query(data, range);
        fixture.collector.dataRevision++;
        manager.prepare(fixture.mark);
        manager.query(data, range);

        expect(profiler.snapshot().countTotals.canvasXIndexBuilds).toBe(2);
    });

    test("rebuilds when the index domain changes", () => {
        const data = Array.from({ length: 100 }, (_, x) => ({ x }));
        const fixture = createFixture(data);
        const manager = new CanvasXIndexManager();
        const profiler = startPerformanceProfiler();
        const range = /** @type {[number, number]} */ ([0, 0]);

        manager.prepare(fixture.mark);
        manager.query(data, range);
        fixture.resolution.zoomExtent = [0, 2000];
        manager.prepare(fixture.mark);
        manager.query(data, range);

        expect(profiler.snapshot().countTotals.canvasXIndexBuilds).toBe(2);
    });

    test("caches a rejected unordered build", () => {
        const data = [{ x: 10 }, { x: 5 }];
        const fixture = createFixture(data);
        const manager = new CanvasXIndexManager();
        const profiler = startPerformanceProfiler();
        const range = /** @type {[number, number]} */ ([0, 0]);

        expect(manager.prepare(fixture.mark)).toBe(true);
        expect(manager.query(data, range)).toBe(false);
        expect(manager.query(data, range)).toBe(false);
        expect(profiler.snapshot().countTotals).toMatchObject({
            canvasXIndexBuilds: 1,
            canvasXIndexRejectedBuilds: 1,
            canvasXIndexFallbackQueries: 2,
        });
    });

    test("bypasses transient facetIndex groups", () => {
        const data = [{ x: 10 }];
        const fixture = createFixture(data);
        fixture.mark.encoders.facetIndex = constantEncoder(0);
        const manager = new CanvasXIndexManager();

        expect(manager.prepare(fixture.mark)).toBe(false);
    });
});
