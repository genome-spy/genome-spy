import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Collector from "../../collector.js";
import AggregateTransform from "../../transforms/aggregate.js";
import ValuesTransform from "../../transforms/values.js";
import ViewParamRuntime from "../../../paramRuntime/viewParamRuntime.js";
import FigWigSource from "./figWigSource.js";

/** @type {{ url: string, getHeader: ReturnType<typeof vi.fn>, close: ReturnType<typeof vi.fn> }[]} */
const readers = [];

/** @type {{ regions: import("@genome-spy/figwig").Region[], options: import("@genome-spy/figwig").BinOptions & { signal: AbortSignal } }[]} */
const queries = [];
/** @type {{ group: number; level: number }[]} */
const summaryQueries = [];
let failHeader = false;
let failQuery = false;
let summariesAvailable = true;
/** @type {string | undefined} */
let unavailableSummary;
/** @type {((result: any) => Promise<any>) | undefined} */
let delayQuery;
/** @type {Promise<void> | undefined} */
let pendingHeader;

vi.mock("generic-filehandle2", () => ({
    RemoteFile: class {
        /** @param {string} url */
        constructor(url) {
            this.url = url;
        }
    },
}));

vi.mock("@genome-spy/figwig", () => ({
    FigWig: class {
        /** @param {any} options */
        constructor(options) {
            this.url = options.filehandle.url;
            readers.push(this);
        }

        getHeader = vi.fn(async () => {
            await pendingHeader;
            if (failHeader) throw new Error("Missing Figwig");
            return {
                tileSize: 128,
                chromosomes: [
                    { name: "chr1", length: 1500 },
                    { name: "chr2", length: 1000 },
                ],
            };
        });

        close = vi.fn(async () => {});

        async getTracks() {
            return [
                { name: "A", group: 0 },
                { name: "B", group: 1 },
            ];
        }

        /** @param {string[]} names */
        async selectTracks(names) {
            return (await this.getTracks()).filter((t) =>
                names.includes(t.name)
            );
        }

        async getZoomLevels() {
            return [{ level: 1, binSize: 512, groups: [0, 1] }];
        }

        /** @param {number} group @param {number} level */
        async getSummary(group, level) {
            summaryQueries.push({ group, level });
            return {
                available:
                    summariesAvailable &&
                    unavailableSummary !== `${group}:${level}`,
            };
        }

        /** @param {any[]} regions @param {any} options */
        async getBinsMulti(regions, options) {
            queries.push({ regions, options });
            if (failQuery) throw new Error("Broken chunk");
            const names = /** @type {string[]} */ (
                options.tracks ?? ["A", "B"]
            );
            if (names.some((name) => !["A", "B"].includes(name))) {
                throw new Error("Unknown track");
            }
            const result = regions.map((region) => {
                const n = Math.ceil(
                    (region.end - region.start) / options.binSize
                );
                return {
                    starts: Uint32Array.from(
                        { length: n },
                        (_, i) => region.start + i * options.binSize
                    ),
                    ends: Uint32Array.from({ length: n }, (_, i) =>
                        Math.min(
                            region.end,
                            region.start + (i + 1) * options.binSize
                        )
                    ),
                    tracks: names.map((name) => ({
                        track: { name },
                        values: Float64Array.from(
                            { length: n },
                            (_, i) =>
                                [0, NaN, Infinity, -1, name === "A" ? 2 : 3][
                                    i % 5
                                ]
                        ),
                    })),
                };
            });
            return delayQuery ? delayQuery(result) : result;
        }
    },
}));

function createFixture() {
    let domain = [0, 100];
    let axisLength = 100;
    /** @type {{ status: import("../../../types/viewContext.js").DataLoadingStatus, detail?: string }[]} */
    const statuses = [];
    const paramRuntime = new ViewParamRuntime(
        () => undefined,
        () => /** @type {any} */ (scaleResolution)
    );
    const setTracks = paramRuntime.allocateSetter("visibleSamples", ["A", "B"]);
    const setPixels = paramRuntime.allocateSetter("pixels", 1);
    const setUrl = paramRuntime.allocateSetter("signalUrl", "signals.fw");
    const setMode = paramRuntime.allocateSetter("signalMode", "exact");
    const genome = {
        totalSize: 4000,
        continuousToDiscreteChromosomeIntervals: (
            /** @type {number[]} */ interval
        ) =>
            [
                { chrom: "chr1", start: 0, end: 2000 },
                { chrom: "chr2", start: 2000, end: 3000 },
                { chrom: "chr3", start: 3000, end: 4000 },
            ].flatMap((c) => {
                const startPos = Math.max(interval[0], c.start) - c.start;
                const endPos = Math.min(interval[1], c.end) - c.start;
                return endPos > startPos
                    ? [{ chrom: c.chrom, startPos, endPos }]
                    : [];
            }),
    };
    const scaleResolution = {
        getAxisLength: () => axisLength,
        getDomain: () => domain,
        getScale: () => ({ genome: () => genome }),
    };
    const view = {
        paramRuntime,
        getBaseUrl: () => "",
        getScaleResolution: () => scaleResolution,
        context: {
            dataFlow: {
                loadingStatusRegistry: {
                    setSource: (
                        /** @type {any} */ _source,
                        /** @type {import("../../../types/viewContext.js").DataLoadingStatus} */ status,
                        /** @type {string | undefined} */ detail
                    ) => statuses.push({ status, detail }),
                },
            },
        },
    };
    /** @param {Partial<import("../../../spec/data.js").FigWigData>} [params] */
    function create(params = {}) {
        const source = new FigWigSource(
            { type: "figwig", url: "signals.fw", debounce: 0, ...params },
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        source.addChild(collector);
        return {
            source,
            collector,
            rows: () => Array.from(collector.getData()),
        };
    }
    return {
        create,
        view,
        paramRuntime,
        statuses,
        setTracks,
        setPixels,
        setUrl,
        setMode,
        setDomain: (/** @type {number[]} */ value) => {
            domain = value;
        },
        setAxisLength: (/** @type {number} */ value) => {
            axisLength = value;
        },
    };
}

describe("FigWigSource", () => {
    beforeEach(() => {
        readers.length = 0;
        queries.length = 0;
        summaryQueries.length = 0;
        failHeader = false;
        failQuery = false;
        summariesAvailable = true;
        unavailableSummary = undefined;
        delayQuery = undefined;
        pendingHeader = undefined;
        vi.useFakeTimers();
        vi.stubGlobal("window", { setTimeout, clearTimeout });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("loads all tracks as exact missing-aware bins and preserves finite zeros and signed values", async () => {
        const { create } = createFixture();
        const { source, rows } = create();
        await source.requestInterval([0, 100]);

        expect(new Set(rows().map((d) => d.sampleId))).toEqual(
            new Set(["A", "B"])
        );
        expect(rows().some((d) => d.score === 0)).toBe(true);
        expect(rows().some((d) => d.score === -1)).toBe(true);
        expect(rows().every((d) => Number.isFinite(d.score))).toBe(true);
        expect(rows()[0]).toEqual({
            chrom: "chr1",
            start: 0,
            end: 2,
            score: 0,
            sampleId: "A",
        });
        expect(queries[0].options).toMatchObject({
            binSize: 2,
            aggregation: "mean",
            missing: "omit",
            useSummaries: false,
        });
        expect(source.isDataReadyForDomain({ x: [0, 100] })).toBe(true);
        source.disposeSubtree();
        await source.whenDisposed();
        expect(readers[0].close).toHaveBeenCalledOnce();
    });

    it("clips chromosome ends, omits unavailable chromosomes, and batches the remaining regions", async () => {
        const { create } = createFixture();
        const { source, rows } = create({ pixelsPerBin: 1 });
        await source.requestInterval([1400, 3500]);

        expect(queries[0].regions).toMatchObject([
            { chromosome: "chr1", end: 1500 },
            { chromosome: "chr2", start: 0, end: 1000 },
        ]);
        expect(queries[0].regions[0].start).toBeGreaterThanOrEqual(0);
        expect(queries[0].regions[0].start).toBeLessThanOrEqual(1400);
        expect(new Set(rows().map((d) => d.chrom))).toEqual(
            new Set(["chr1", "chr2"])
        );
        expect(
            rows().every((d) => d.end <= (d.chrom === "chr1" ? 1500 : 1000))
        ).toBe(true);
        source.disposeSubtree();
    });

    it("reactively selects, empties and restores tracks while retaining the reader and publishing downstream output", async () => {
        const { create, view, setTracks, paramRuntime } = createFixture();
        const { source, rows } = create({ tracks: { expr: "visibleSamples" } });
        const output = paramRuntime.registerOutput("counts");
        const aggregate = new AggregateTransform({ type: "aggregate" });
        const values = new ValuesTransform(
            { type: "values", field: "count", param: "counts" },
            /** @type {any} */ (view)
        );
        source.addChild(aggregate);
        aggregate.addChild(values);
        values.initializeOnce();
        await source.requestInterval([0, 100]);

        setTracks(["B"]);
        await paramRuntime.whenPropagated();
        expect(source.isDataReadyForDomain({ x: [0, 100] })).toBe(false);
        expect(readers[0].close).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
        expect(new Set(rows().map((d) => d.sampleId))).toEqual(new Set(["B"]));

        const queryCount = queries.length;
        setTracks([]);
        await vi.runAllTimersAsync();
        expect(rows()).toEqual([]);
        expect(queries).toHaveLength(queryCount);
        expect(output.value.get()).toEqual([0]);
        expect(source.isDataReadyForDomain({ x: [0, 100] })).toBe(true);

        setTracks(["B", "A"]);
        await vi.runAllTimersAsync();
        expect(new Set(rows().map((d) => d.sampleId))).toEqual(
            new Set(["B", "A"])
        );
        expect(readers).toHaveLength(1);
        expect(readers[0].getHeader).toHaveBeenCalledTimes(1);
        expect(output.value.get()).toEqual([rows().length]);
        source.disposeSubtree();
        await source.whenDisposed();
        expect(readers[0].close).toHaveBeenCalledOnce();
    });

    it("aborts superseded selection queries and never publishes their stale data", async () => {
        const { create, setTracks } = createFixture();
        const { source, rows } = create({ tracks: { expr: "visibleSamples" } });
        /** @type {() => void} */
        let release = () => {
            throw new Error("No pending query");
        };
        // The obsolete reader ignores cancellation, exercising the source's publication guard.
        delayQuery = (result) =>
            new Promise((resolve) => {
                release = () => resolve(result);
            });
        const pending = source.requestInterval([0, 100]);
        await vi.waitFor(() => expect(queries).toHaveLength(1));
        delayQuery = undefined;
        setTracks(["B"]);
        await vi.runAllTimersAsync();

        expect(queries[0].options.signal.aborted).toBe(true);
        release();
        await pending;
        expect(new Set(rows().map((d) => d.sampleId))).toEqual(new Set(["B"]));
        expect(readers).toHaveLength(1);
        source.disposeSubtree();
        expect(queries.at(-1).options.signal.aborted).toBe(true);
    });

    it("reports header and query failures and retries without retaining failed handles", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { create, statuses } = createFixture();
        const { source, rows } = create();
        failHeader = true;
        await source.requestInterval([0, 100]);
        expect(statuses.at(-1)).toMatchObject({
            status: "error",
            detail: "Missing Figwig",
        });
        expect(source.isDataReadyForDomain({ x: [0, 100] })).toBe(false);
        expect(readers[0].close).toHaveBeenCalledOnce();

        failHeader = false;
        failQuery = true;
        await source.requestInterval([0, 100]);
        expect(statuses.at(-1)).toMatchObject({
            status: "error",
            detail: "Broken chunk",
        });
        failQuery = false;
        await source.requestInterval([0, 100]);
        expect(rows().length).toBeGreaterThan(0);
        expect(readers).toHaveLength(2);
        expect(statuses.at(-1).status).toBe("complete");
        source.disposeSubtree();
        await source.whenDisposed();
        expect(
            readers.every((reader) => reader.close.mock.calls.length === 1)
        ).toBe(true);
    });

    it("waits for a pending handle acquisition and closes its reader", async () => {
        const gate = Promise.withResolvers();
        pendingHeader = gate.promise;
        const { create } = createFixture();
        const { source } = create();
        const request = source.requestInterval([0, 100]);
        await vi.waitFor(() => expect(readers).toHaveLength(1));

        source.disposeSubtree();
        let settled = false;
        const cleanup = source.whenDisposed().then(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
        expect(readers[0].close).not.toHaveBeenCalled();

        gate.resolve(undefined);
        await Promise.all([request, cleanup]);
        expect(readers[0].close).toHaveBeenCalledOnce();
        expect(queries).toHaveLength(0);
    });

    it("closes a reader with a pending query and prevents late publication", async () => {
        const gate = Promise.withResolvers();
        // Even work that ignores cancellation must not publish after removal.
        delayQuery = async (result) => {
            await gate.promise;
            return result;
        };
        const { create, statuses } = createFixture();
        const { source, collector } = create();
        const request = source.requestInterval([0, 100]);
        await vi.waitFor(() => expect(queries).toHaveLength(1));

        source.disposeSubtree();
        await source.whenDisposed();
        expect(readers[0].close).toHaveBeenCalledOnce();
        expect(queries[0].options.signal.aborted).toBe(true);

        gate.resolve(undefined);
        await request;
        expect(collector.completed).toBe(false);
        expect(statuses).toEqual([{ status: "loading", detail: undefined }]);
    });

    it("reloads at changed viewport resolution and pixelsPerBin, reopening only for URL changes", async () => {
        const { create, setAxisLength, setPixels, setUrl } = createFixture();
        const { source } = create({
            url: { expr: "signalUrl" },
            pixelsPerBin: { expr: "pixels" },
        });
        await source.requestInterval([0, 100]);
        expect(queries.at(-1).options.binSize).toBe(1);
        setAxisLength(20);
        await source.requestInterval([0, 100]);
        expect(queries.at(-1).options.binSize).toBe(5);
        setPixels(2);
        await vi.runAllTimersAsync();
        expect(queries.at(-1).options.binSize).toBe(10);
        expect(readers).toHaveLength(1);
        setUrl("other.fw");
        await vi.runAllTimersAsync();
        expect(readers.map((reader) => reader.url)).toEqual([
            "signals.fw",
            "other.fw",
        ]);
        source.disposeSubtree();
        await source.whenDisposed();
        expect(
            readers.every((reader) => reader.close.mock.calls.length === 1)
        ).toBe(true);
    });

    it.each([1, 100, 1000])(
        "bounds prefetch for an axis of %i pixels and reuses coverage while panning inside it",
        async (axisLength) => {
            const { create, setAxisLength } = createFixture();
            setAxisLength(axisLength);
            const { source } = create({ pixelsPerBin: 1 });
            const domain = [1437, 2437];
            await source.requestInterval(domain);

            const loaded = /** @type {number[]} */ (source.getLoadedDomain());
            expect(loaded[0]).toBeLessThanOrEqual(domain[0]);
            expect(loaded[1]).toBeGreaterThanOrEqual(domain[1]);
            expect(loaded[1] - loaded[0]).toBeLessThanOrEqual(1250);

            // Same-span navigation inside published coverage must not repeat decoding.
            const shifted = [domain[0] + 1, domain[1] + 1];
            await source.requestInterval(shifted);
            expect(queries).toHaveLength(1);
            expect(source.isDataReadyForDomain({ x: shifted })).toBe(true);
            source.disposeSubtree();
        }
    );

    it("reloads changed resolution in the same bounded window and retries failed loads", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { create, setAxisLength, statuses } = createFixture();
        const { source } = create({ pixelsPerBin: 1 });
        const domain = [1437, 2437];
        await source.requestInterval(domain);
        const regions = queries[0].regions;
        expect(queries[0].options.binSize).toBe(10);

        setAxisLength(1);
        failQuery = true;
        await source.requestInterval(domain);
        expect(queries).toHaveLength(2);
        expect(queries[1].regions).toEqual(regions);
        expect(queries[1].options.binSize).toBe(1000);
        expect(statuses.at(-1).status).toBe("error");
        expect(source.isDataReadyForDomain({ x: domain })).toBe(false);

        failQuery = false;
        await source.requestInterval(domain);
        expect(queries).toHaveLength(3);
        expect(queries[2].options.binSize).toBe(1000);
        expect(source.isDataReadyForDomain({ x: domain })).toBe(true);
        expect(readers).toHaveLength(1);
        source.disposeSubtree();
    });

    it("uses required aligned summaries at coarse fast resolution and clips published bins", async () => {
        const { create, setAxisLength } = createFixture();
        setAxisLength(10);
        const { source, rows } = create({ mode: "fast", pixelsPerBin: 1 });
        await source.requestInterval([1400, 3500]);

        const { regions, options } = queries[0];
        expect(options).toMatchObject({
            binSize: 256,
            aggregation: "mean",
            missing: "zero",
            useSummaries: true,
        });
        expect(regions.map((r) => r.chromosome)).toEqual(["chr1", "chr2"]);
        expect(regions.every((r) => r.start % options.binSize === 0)).toBe(
            true
        );
        expect(regions[0].end).toBe(1500);
        expect(regions[1].end).toBe(1000);
        expect(rows()[0]).toMatchObject({
            chrom: "chr1",
            start: source.getLoadedDomain()[0],
            end: 1500,
            score: 0,
        });
        expect(rows()[0].start).toBeGreaterThan(regions[0].start);
        expect(
            rows().every((d) => Number.isFinite(d.score) && d.start < d.end)
        ).toBe(true);
        source.disposeSubtree();
    });

    it("does not align an entirely out-of-file chromosome tail back into earlier data", async () => {
        const { create, setAxisLength } = createFixture();
        setAxisLength(1);
        const { source, rows } = create({ mode: "fast", pixelsPerBin: 1 });
        await source.requestInterval([1600, 2400]);

        expect(queries[0].regions).toEqual([
            { chromosome: "chr2", start: 0, end: 1000 },
        ]);
        expect(rows()).toEqual([
            { chrom: "chr2", start: 0, end: 400, score: 0, sampleId: "A" },
            { chrom: "chr2", start: 0, end: 400, score: 0, sampleId: "B" },
        ]);
        source.disposeSubtree();
    });

    it("switches modes and fine/coarse resolutions reactively while retaining the reader", async () => {
        const { create, setMode, setTracks, setDomain, setAxisLength } =
            createFixture();
        setDomain([0, 3000]);
        setAxisLength(10);
        const { source, rows } = create({
            mode: { expr: "signalMode" },
            tracks: { expr: "visibleSamples" },
            pixelsPerBin: 1,
        });
        await source.requestInterval([0, 3000]);
        expect(queries.at(-1).options).toMatchObject({
            binSize: 300,
            missing: "omit",
            useSummaries: false,
        });

        setMode("fast");
        await vi.runAllTimersAsync();
        expect(queries.at(-1).options).toMatchObject({
            binSize: 512,
            missing: "zero",
            useSummaries: true,
        });
        setTracks(["B"]);
        await vi.runAllTimersAsync();
        expect(new Set(rows().map((d) => d.sampleId))).toEqual(new Set(["B"]));

        setAxisLength(3000 / 128);
        await source.requestInterval([0, 3000]);
        expect(queries.at(-1).options).toMatchObject({
            binSize: 128,
            useSummaries: true,
        });
        setAxisLength(24);
        await source.requestInterval([0, 3000]);
        expect(queries.at(-1).options).toMatchObject({
            binSize: 125,
            missing: "omit",
            useSummaries: false,
        });
        setMode("exact");
        await vi.runAllTimersAsync();
        expect(queries.at(-1).options.useSummaries).toBe(false);
        expect(readers).toHaveLength(1);
        expect(readers[0].getHeader).toHaveBeenCalledTimes(1);
        source.disposeSubtree();
    });

    it("reports unavailable required summaries without issuing an exact fallback query", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { create, setAxisLength, statuses } = createFixture();
        setAxisLength(1);
        summariesAvailable = false;
        const { source } = create({ mode: "fast" });
        await source.requestInterval([0, 1000]);

        expect(queries).toHaveLength(0);
        expect(statuses.at(-1)).toMatchObject({
            status: "error",
            detail: "Required summaries unavailable",
        });
        expect(source.isDataReadyForDomain({ x: [0, 1000] })).toBe(false);
        source.disposeSubtree();
    });

    it("checks the selected groups' compatible zooms before any bin queries", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { create, setAxisLength, statuses } = createFixture();
        setAxisLength(10);
        unavailableSummary = "1:1";
        const { source } = create({ mode: "fast", pixelsPerBin: 1 });
        await source.requestInterval([0, 3000]);

        expect(summaryQueries).toContainEqual({ group: 1, level: 1 });
        expect(queries).toHaveLength(0);
        expect(statuses.at(-1).status).toBe("error");
        source.disposeSubtree();

        summaryQueries.length = 0;
        const selected = create({
            mode: "fast",
            pixelsPerBin: 1,
            tracks: ["A"],
        });
        await selected.source.requestInterval([0, 3000]);
        expect(
            summaryQueries.every((q) => q.group === 0 && q.level === 1)
        ).toBe(true);
        expect(queries).toHaveLength(1);
        selected.source.disposeSubtree();
    });

    it.each([
        [{ pixelsPerBin: 0 }, "pixelsPerBin"],
        [{ mode: "approximate" }, "mode must be"],
        [{ tracks: { expr: "42" } }, "array of track names"],
        [{ tracks: ["missing"] }, "Unknown track"],
        [
            {
                url: {
                    template: "{sample}.fw",
                    values: ["A", "B"],
                    field: "sample",
                },
            },
            "exactly one resolved URL",
        ],
        [
            {
                url: {
                    template: "{sampleId}.fw",
                    values: ["wrong"],
                    field: "sampleId",
                },
            },
            "conflicts with loaded datum",
        ],
    ])(
        "rejects invalid configuration or conflicting metadata: %j",
        async (params, detail) => {
            vi.spyOn(console, "error").mockImplementation(() => undefined);
            const { create, statuses } = createFixture();
            const { source } = create(/** @type {any} */ (params));
            await source.requestInterval([0, 100]);
            expect(statuses.at(-1).status).toBe("error");
            expect(statuses.at(-1).detail).toContain(detail);
            expect(source.isDataReadyForDomain({ x: [0, 100] })).toBe(false);
            source.disposeSubtree();
        }
    );
});
