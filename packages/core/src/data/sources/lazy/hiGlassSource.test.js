import { afterEach, expect, test, vi } from "vitest";
import Collector from "../../collector.js";
import GenomeSpy from "../../../genomeSpyBase.js";
import UnitView from "../../../view/unitView.js";
import Rectangle from "../../../view/layout/rectangle.js";
import { createBroadcastingTestViewContext } from "../../../view/testUtils.js";
import HiGlassTileSource from "./hiGlassTileSource.js";
import {
    decodeTile,
    getTileWindow,
    mirrorDiagonal,
    transposeTile,
} from "./hiGlassTiles.js";

afterEach(() => vi.unstubAllGlobals());

const smallTileset = {
    min_pos: [0, 0],
    max_pos: [8, 8],
    max_width: 8,
    max_zoom: 2,
    bins_per_dimension: 2,
    chromsizes: [["chr1", 8]],
};

test("triangle windows include an offscreen endpoint and key the projected tile set", () => {
    /** @type {import("./hiGlassTiles.js").HiGlassMetadata} */
    const metadata = {
        min_pos: [0, 0],
        max_pos: [32, 32],
        max_width: 32,
        max_zoom: 3,
        bins_per_dimension: 4,
        chromsizes: [["chr1", 32]],
    };
    const short = getTileWindow(metadata, [[8, 16]], [16], 1);
    const tall = getTileWindow(metadata, [[8, 16]], [16], 12);
    /** @param {typeof tall} window @param {number} x @param {number} y */
    const includesTile = (window, x, y) =>
        window.rows.some(
            ([row, start, end]) => row === y && start <= x && x < end
        );
    expect(tall.level).toBe(short.level);
    expect(includesTile(tall, 1, 3)).toBe(true);
    expect(includesTile(short, 1, 3)).toBe(false);
    expect(tall.key).not.toBe(short.key);
    expect(includesTile(tall, 3, 1)).toBe(false);
});

test("decodes float16 cells and mirrors the stored triangle", () => {
    const bytes = new Uint8Array([0, 60, 0, 0, 0, 126, 0, 0]);
    const values = decodeTile({ dense: bytes.toBase64(), dtype: "float16" }, 2);
    expect(Array.from(values)).toEqual([1, 0, NaN, 0]);
    expect(Array.from(transposeTile(values, 2))).toEqual([1, NaN, 0, 0]);
    mirrorDiagonal(values, 2);
    expect(Array.from(values)).toEqual([1, NaN, NaN, 0]);
});

test.each([undefined, /** @type {const} */ ("triangle")])(
    "publishes only the latest tile window after cancellation (projection %s)",
    async (projection) => {
        let domain = [0, 8];
        const scale = {
            type: "locus",
            getAxisLength: () => 2,
            getDomain: () => domain,
            getAssembly: () => ({ contigs: [{ name: "chr1", size: 8 }] }),
        };
        // Supply the view graph used by the embed API's lazy-data wait.
        const context = createBroadcastingTestViewContext();
        const view = Object.assign(Object.create(UnitView.prototype), {
            context,
            spec: { projection },
            getBaseUrl: () => "",
            getScaleResolution: (/** @type {string} */ channel) =>
                projection && channel === "y" ? undefined : scale,
            layoutCoords: Rectangle.create(0, 0, 2, 2),
            getEffectiveOpacity: () => 1,
            getLayoutAncestors: () => [view],
            getPathString: () => "test",
            isVisible: () => true,
            /** @param {(view: UnitView) => void} visitor */
            visit: (visitor) => visitor(view),
        });
        const source = new HiGlassTileSource(
            {
                type: "higlass",
                url: "https://tiles.example/",
                tileset: "test",
            },
            view
        );
        const collector = new Collector({ type: "collect" });
        source.addChild(collector);
        view.flowHandle = { collector, dataSource: source };
        const engine = Object.assign(Object.create(GenomeSpy.prototype), {
            viewRoot: view,
        });

        const coarse = Promise.withResolvers();
        const replacement = Promise.withResolvers();
        const fine = Promise.withResolvers();
        const fetch = vi.fn(
            /** @param {URL} url @param {RequestInit} _options */
            (url, _options) => {
                const id = url.searchParams.get("d");
                if (id === "test.0.0.0") {
                    return fetch.mock.calls.length === 2
                        ? coarse.promise
                        : replacement.promise;
                }
                if (id === "test.2.0.0") return fine.promise;
                expect(id).toBe("test");
                return Promise.resolve(
                    Response.json({
                        test: smallTileset,
                    })
                );
            }
        );
        const dense = new Uint8Array(
            new Float32Array([1, 0, 2, 3]).buffer
        ).toBase64();
        vi.stubGlobal("fetch", fetch);

        try {
            await source.load();
            await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
            vi.useFakeTimers();
            try {
                // Zoom frames arrive in separate turns and can change the tile level.
                for (const end of [6, 4, 3]) {
                    domain = [0, end];
                    source.ensureViewportData();
                    await vi.advanceTimersByTimeAsync(16);
                }
                expect(fetch).toHaveBeenCalledTimes(2);
                expect(fetch.mock.calls[1][1].signal.aborted).toBe(false);

                domain = [0, 2];
                source.ensureViewportData();
                await vi.runOnlyPendingTimersAsync();
            } finally {
                vi.useRealTimers();
            }
            await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
            expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
            const ready = vi.fn();
            const visibleData = engine
                .awaitVisibleLazyData(AbortSignal.timeout(2000))
                .then(ready);
            await Promise.resolve();
            expect(ready).not.toHaveBeenCalled();
            const ids = fetch.mock.calls[2][0].searchParams.getAll("d");
            expect(ids).toEqual(
                projection ? ["test.2.0.0", "test.2.0.1"] : ["test.2.0.0"]
            );
            fine.resolve(
                Response.json(
                    Object.fromEntries(
                        ids.map((id) => [id, { dense, dtype: "float32" }])
                    )
                )
            );
            await visibleData;
            expect(source.isDataReadyForDomain({})).toBe(true);
            const [fineTile] = collector.getData();
            expect(fineTile.dimensions.column.step).toBe(1);
            expect(fineTile.binSize).toBe(1);
            expect(Array.from(fineTile.fields.value)).toEqual([1, 2, 2, 3]);

            // A stale response can arrive after a newer request publishes the same window.
            domain = [0, 8];
            source.ensureViewportData();
            await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
            replacement.resolve(
                Response.json({ "test.0.0.0": { dense, dtype: "float32" } })
            );
            await engine.awaitVisibleLazyData(AbortSignal.timeout(2000));
            const revision = collector.dataRevision;
            coarse.resolve(
                Response.json({ "test.0.0.0": { dense, dtype: "float32" } })
            );
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(collector.dataRevision).toBe(revision);
            expect(source.isDataReadyForDomain({})).toBe(true);

            vi.useFakeTimers();
            /** @type {Set<(timestamp: number) => void>} */
            const frameCallbacks = new Set();
            const requestFrame = vi
                .spyOn(context.animator, "requestTransition")
                .mockImplementation((callback) => {
                    frameCallbacks.add(callback);
                });
            const runFrame = () => {
                const callbacks = [...frameCallbacks];
                frameCallbacks.clear();
                for (const callback of callbacks) callback(0);
            };
            try {
                domain = [0, 4];
                source.ensureViewportData();
                runFrame();
                await vi.advanceTimersByTimeAsync(100);
                expect(fetch).toHaveBeenCalledTimes(4);

                domain = [0, 2];
                source.ensureViewportData();
                source.ensureViewportData();
                expect(collector.dataRevision).toBe(revision);
                runFrame();
                expect(source.isDataReadyForDomain({})).toBe(true);
                expect(
                    Array.from(collector.getData())[0].dimensions.column.step
                ).toBe(1);
                await vi.runOnlyPendingTimersAsync();
                expect(fetch).toHaveBeenCalledTimes(4);
            } finally {
                requestFrame.mockRestore();
                vi.useRealTimers();
            }
        } finally {
            source.dispose();
        }
    }
);

test("debounces domain changes within one tile window and honors the cache budget", async () => {
    let domain = [0, 8];
    let axisLength = 2;
    let omitLastTile = false;
    const view = Object.assign(Object.create(UnitView.prototype), {
        context: createBroadcastingTestViewContext(),
        getBaseUrl: () => "",
        getLayoutAncestors: () => [view],
        getPathString: () => "test",
        isVisible: () => true,
        getScaleResolution: () => ({
            type: "locus",
            getDomain: () => domain,
            getAxisLength: () => axisLength,
            getAssembly: () => ({ contigs: [{ name: "chr1", size: 8 }] }),
        }),
    });
    const dense = new Uint8Array(16).toBase64();
    const fetch = vi.fn(async (/** @type {URL} */ url) => {
        const ids = url.searchParams.getAll("d");
        if (omitLastTile) ids.pop();
        return Response.json(
            ids[0] === "test"
                ? { test: smallTileset }
                : Object.fromEntries(
                      ids.map((id) => [id, { dense, dtype: "float32" }])
                  )
        );
    });
    vi.stubGlobal("fetch", fetch);
    vi.useFakeTimers();
    const source = new HiGlassTileSource(
        {
            type: "higlass",
            url: "https://tiles.example/",
            tileset: "test",
            cacheSizeMiB: 16 / 1024 ** 2,
            debounce: 100,
        },
        view
    );
    try {
        await source.load();
        await vi.advanceTimersByTimeAsync(0);
        expect(source.isViewportReady()).toBe(true);

        domain = [0, 3.5];
        source.ensureViewportData();
        await vi.advanceTimersByTimeAsync(60);
        domain = [0, 3.75];
        source.ensureViewportData();
        await vi.advanceTimersByTimeAsync(99);
        expect(fetch).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetch.mock.calls[2][0].searchParams.get("d")).toBe("test.1.0.0");
        expect(source.isViewportReady()).toBe(true);

        domain = [0, 8];
        source.ensureViewportData();
        expect(source.isViewportReady()).toBe(false);
        await vi.advanceTimersByTimeAsync(100);
        expect(fetch.mock.calls[3][0].searchParams.get("d")).toBe("test.0.0.0");
        expect(source.isViewportReady()).toBe(true);

        // At the next resolution, the response omits the last of three tiles.
        axisLength = 4;
        omitLastTile = true;
        source.ensureViewportData();
        await vi.advanceTimersByTimeAsync(100);
        expect(source.isViewportReady()).toBe(false);

        omitLastTile = false;
        source.ensureViewportData();
        await vi.advanceTimersByTimeAsync(100);
        expect(fetch.mock.lastCall[0].searchParams.getAll("d")).toEqual([
            "test.1.0.0",
            "test.1.1.1",
        ]);
        expect(source.isViewportReady()).toBe(true);
    } finally {
        source.dispose();
        vi.useRealTimers();
    }
});
