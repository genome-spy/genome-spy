import { HicFile } from "@gmod/hic";
import { afterEach, expect, test, vi } from "vitest";
import GenomeStore from "../../../genome/genomeStore.js";
import { awaitSubtreeLazyReady } from "../../../view/dataReadiness.js";
import Rectangle from "../../../view/layout/rectangle.js";
import {
    createHeadlessEngine,
    renderToLayout,
} from "../../../view/testUtils.js";
import UnitView from "../../../view/unitView.js";
import "./hicSource.js";
import HicTileSource from "./hicTileSource.js";
import { matchHicContigs, planHicWindow } from "./hicTiles.js";

/** @typedef {import("../../../spec/root.js").RootSpec} RootSpec */
/** @typedef {import("./hicTiles.js").HicRasterTile} HicRasterTile */

afterEach(() => vi.restoreAllMocks());

const chromosomes = [
    { index: 0, name: "All", size: 1 },
    { index: 1, name: "2", size: 14 },
    { index: 2, name: "1", size: 13 },
];

/**
 * Mock the file reader only. The spec, lazy registration, viewport, and
 * collector exercise the real publication path.
 * @param {import("@gmod/hic").HicMetadata["chromosomes"]} chroms
 * @param {number[]} resolutions
 */
function mockMetadata(chroms, resolutions) {
    vi.spyOn(HicFile.prototype, "getMetaData").mockResolvedValue({
        version: 9,
        genome: "test",
        chromosomes: chroms,
        resolutions,
    });
    return vi
        .spyOn(HicFile.prototype, "getMatrix")
        .mockResolvedValue(/** @type {any} */ ({ getZoomData: () => true }));
}

/** @param {number} x @param {number} y @param {number} count */
function contacts(x, y, count) {
    return {
        bin1: Int32Array.of(x),
        bin2: Int32Array.of(y),
        counts: Float32Array.of(count),
    };
}

/**
 * @param {RootSpec} spec
 * @param {{name: string, size: number}[]} contigs
 */
async function open(spec, contigs) {
    const genomeStore = new GenomeStore(".");
    await genomeStore.initialize({ name: "hicTest", contigs });
    const { view } = await createHeadlessEngine(spec, {
        contextOptions: { genomeStore },
    });
    renderToLayout(view, Rectangle.create(0, 0, 100, 100));
    const unit = view
        .getDescendants()
        .filter((v) => v instanceof UnitView)
        .find((v) => v.name === "contacts");
    const source = unit.flowHandle.dataSource;
    expect(source).toBeInstanceOf(HicTileSource);
    /** @type {HicTileSource} */
    const hic = /** @type {HicTileSource} */ (source);
    hic.ensureViewportData();
    return {
        view,
        source: hic,
        scale: unit.getScaleResolution("x"),
        ready: () =>
            awaitSubtreeLazyReady(
                view.context,
                view,
                undefined,
                AbortSignal.timeout(1000)
            ),
        data: () =>
            /** @type {HicRasterTile[]} */ (
                Array.from(unit.getCollector().getData())
            ),
    };
}

test("a rectangular .hic view keeps assembly axes, terminal bins, and normalized missing values", async () => {
    const readMatrix = mockMetadata(chromosomes, [5]);
    const read = vi
        .spyOn(HicFile.prototype, "getContactRecords")
        .mockImplementation(async (normalization, column, row, binSize) => ({
            records: contacts(
                column.start / binSize,
                row.start / binSize,
                normalization === "KR" ? 7 : 21
            ),
            appliedNormalization:
                normalization === "SCALE" ? "NONE" : normalization,
        }));
    vi.spyOn(HicFile.prototype, "getNormalizationVector").mockImplementation(
        async (_normalization, chr) =>
            /** @type {any} */ ({
                getValues: (
                    /** @type {number} */ start,
                    /** @type {number} */ end
                ) =>
                    Promise.resolve(
                        Float64Array.from({ length: end - start }, (_, i) =>
                            chr === "2" && i + start === 1 ? NaN : 1
                        )
                    ),
            })
    );
    const { view, source, scale, ready, data } = await open(
        {
            name: "contacts",
            params: [{ name: "normalization", value: "KR" }],
            data: {
                lazy: {
                    type: "hic",
                    url: "https://example.org/test.hic",
                    normalization: { expr: "normalization" },
                    debounce: 0,
                },
            },
            mark: "raster",
            encoding: {
                x: {
                    dimension: "column",
                    type: "locus",
                    scale: { domain: [0, 12], zoom: true },
                },
                y: {
                    dimension: "row",
                    type: "locus",
                    scale: { domain: [13, 26] },
                },
                color: { field: "value", type: "quantitative" },
            },
        },
        [
            { name: "chr1", size: 13 },
            { name: "chr2", size: 14 },
        ]
    );
    try {
        await vi.waitFor(() => expect(source.isViewportReady()).toBe(true));
        expect(read).toHaveBeenCalledWith(
            "KR",
            { chr: "1", start: 10, end: 13 },
            { chr: "2", start: 0, end: 10 },
            5,
            expect.objectContaining({ bothOrientations: true })
        );
        const tiles = data();
        expect(tiles).toHaveLength(4);
        expect(
            tiles.find(
                (tile) =>
                    tile.dimensions.column.origin === 10 &&
                    tile.dimensions.row.origin === 13
            )
        ).toMatchObject({
            binSize: 5,
            dimensions: {
                column: { origin: 10, step: 3, count: 1 },
                row: { origin: 13, step: 5, count: 2 },
            },
            fields: { value: Float32Array.of(7, NaN) },
        });
        expect(tiles[0].fields.value).toEqual(Float32Array.of(7, 0, NaN, NaN));

        source.paramRuntime.setValue("normalization", "SCALE");
        await source.paramRuntime.whenPropagated();
        await expect(ready()).rejects.toThrow(
            'normalization "SCALE" is unavailable'
        );

        // A host can request an export as soon as the corrected param settles.
        source.paramRuntime.setValue("normalization", "NONE");
        await source.paramRuntime.whenPropagated();
        await ready();
        expect(data()[0].fields.value).toEqual(Float32Array.of(21, 0, 0, 0));

        read.mockClear();
        source.paramRuntime.setValue("normalization", "KR");
        await vi.waitFor(() => expect(data()).toEqual(tiles));
        expect(read).not.toHaveBeenCalled();

        // Moving to an absent chromosome pair clears previously shown tiles.
        readMatrix.mockResolvedValue(undefined);
        read.mockClear();
        await scale.zoomTo([13, 26], 0);
        await vi.waitFor(() => expect(source.isViewportReady()).toBe(true));
        expect(data()).toEqual([]);
        expect(read).not.toHaveBeenCalled();

        await scale.zoomTo([0, 12], 0);
        await vi.waitFor(() => expect(source.isViewportReady()).toBe(true));
        expect(data()).toEqual(tiles);
        expect(read).not.toHaveBeenCalled();
    } finally {
        view.disposeSubtree();
    }
});

test("an existing chromosome pair reports its available bin sizes when the chosen level is missing", async () => {
    const contigs = [
        { name: "chr1", size: 4000 },
        { name: "chr2", size: 4000 },
    ];
    const levels = [{ zoom: { binSize: 50 } }];
    mockMetadata(
        contigs.map((contig, index) => ({ ...contig, index })),
        [5, 50]
    ).mockResolvedValue(
        /** @type {any} */ ({
            getZoomData: (/** @type {number} */ binSize) =>
                levels.find(({ zoom }) => zoom.binSize === binSize),
            getZoomLevels: () => levels,
        })
    );
    const { view, ready } = await open(
        {
            name: "contacts",
            data: {
                lazy: {
                    type: "hic",
                    url: "https://example.org/test.hic",
                    debounce: 0,
                },
            },
            mark: "raster",
            encoding: {
                x: {
                    dimension: "column",
                    type: "locus",
                    scale: { domain: [200, 280] },
                },
                y: {
                    dimension: "row",
                    type: "locus",
                    scale: { domain: [4200, 4280] },
                },
                color: { field: "value", type: "quantitative" },
            },
        },
        contigs
    );
    try {
        await expect(ready()).rejects.toThrow(
            "No 5 bp .hic matrix is stored for chr1/chr2. Available bin sizes are 50 bp."
        );
    } finally {
        view.disposeSubtree();
    }
});

test("a zoom change aborts the previous resolution and publishes only the new tiles", async () => {
    mockMetadata([{ index: 1, name: "1", size: 4000 }], [50, 5]);
    const coarse = Promise.withResolvers();
    const read = vi
        .spyOn(HicFile.prototype, "getContactRecords")
        .mockImplementation(async (_normalization, column, row, binSize) =>
            binSize === 50
                ? coarse.promise
                : {
                      records: contacts(
                          column.start / binSize,
                          row.start / binSize,
                          5
                      ),
                      appliedNormalization: "NONE",
                  }
        );
    const { view, source, scale, data } = await open(
        {
            name: "contacts",
            projection: { type: "triangle", direction: "down" },
            data: {
                lazy: {
                    type: "hic",
                    url: "https://example.org/test.hic",
                    debounce: 0,
                },
            },
            mark: "raster",
            encoding: {
                x: {
                    dimension: "column",
                    type: "locus",
                    scale: { zoom: true, domain: [0, 3999] },
                },
                y: { dimension: "row", type: "locus" },
                color: { field: "value", type: "quantitative" },
            },
        },
        [{ name: "chr1", size: 4000 }]
    );
    try {
        await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
        const signal = read.mock.calls[0][4].signal;
        expect(read.mock.calls[0][3]).toBe(50);
        await scale.zoomTo([200, 280], 0);
        await vi.waitFor(() => expect(source.isViewportReady()).toBe(true));
        expect(signal.aborted).toBe(true);

        // Simulate a reader completing after it was cancelled.
        coarse.resolve({
            records: contacts(0, 0, 50),
            appliedNormalization: "NONE",
        });
        await coarse.promise;
        const tiles = data();
        expect(tiles.map((tile) => tile.dimensions.column.step)).toEqual([5]);
        expect(tiles[0].fields.value[0]).toBe(5);
    } finally {
        view.disposeSubtree();
    }
});

test("triangle planning includes offscreen endpoints and skips the hidden matrix half", () => {
    const contigs = matchHicContigs(
        [{ name: "chr1", size: 512 }],
        [{ index: 1, name: "1", size: 512 }]
    );
    const window = planHicWindow(
        contigs,
        [1],
        { width: 20, height: 100 },
        [120, 140]
    );
    const pairs = window.tiles.map(({ column, row }) => [
        column.dimension.origin,
        row.dimension.origin,
    ]);
    expect(pairs).toContainEqual([0, 128]);
    expect(pairs).not.toContainEqual([128, 0]);
});

test("planning tries a coarser stored level when a fine rectangular window exceeds the budget", () => {
    const file = Array.from({ length: 40 }, (_, index) => ({
        name: `chr${index + 1}`,
        index,
        size: 1500,
    }));
    const contigs = matchHicContigs(file, file);
    const plot = { width: 1000, height: 1000 };
    const domain = [0, 60_000];
    // At 64 bp every chromosome adds a short terminal tile along each axis.
    expect(planHicWindow(contigs, [64], plot, domain, domain)).toBeUndefined();
    expect(
        planHicWindow(contigs, [64, 75], plot, domain, domain)?.binSize
    ).toBe(75);
});
