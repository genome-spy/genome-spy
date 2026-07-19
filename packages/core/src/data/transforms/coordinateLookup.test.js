import { afterEach, expect, test, vi } from "vitest";
import Collector from "../collector.js";
import { processData } from "../flowTestUtils.js";
import { registerLazyDataSource } from "../sources/dataSourceFactory.js";
import MockLazySource from "../sources/lazy/mockLazySource.js";
import SingleAxisLazySource from "../sources/lazy/singleAxisLazySource.js";
import { createHeadlessEngine } from "../../view/testUtils.js";
import CoordinateLookupTransform from "./coordinateLookup.js";

/** @type {(() => void)[]} */
const unregisters = [];

afterEach(() => {
    for (const unregister of unregisters.splice(0)) {
        unregister();
    }
});

test("omits primary rows outside loaded side-input coverage", () => {
    const domain = [0, 1];
    const scaleResolution = {
        getDomain: () => domain,
        getScale: () => ({}),
    };
    const view = {
        getScaleResolution: () => scaleResolution,
    };
    const source = new TestLazySource(view);
    const foreign = new Collector({ type: "collect" });
    source.addChild(foreign);
    source.publish([{ pos: 0, score: 0.2 }]);

    const lookup = new CoordinateLookupTransform(
        {
            type: "coordinateLookup",
            from: { data: { lazy: /** @type {any} */ ({ type: "mockLazy" }) } },
            coordinate: { field: "pos" },
            key: "pos",
            values: ["score"],
        },
        foreign,
        source,
        /** @type {any} */ (view)
    );

    expect(processData(lookup, [{ pos: 0 }, { pos: 1 }, { pos: 2 }])).toEqual([
        { pos: 0, score: 0.2 },
        { pos: 1, score: null },
    ]);
});

test("joins flattened lazy sequence with a lazy coordinate side input", async () => {
    unregisters.push(
        registerLazyDataSource(
            (params) => /** @type {any} */ (params).type == "mockLazy",
            MockLazySource
        )
    );

    const { view, context } = await createHeadlessEngine({
        assembly: "hg38",
        data: {
            lazy: /** @type {any} */ ({
                type: "mockLazy",
                channel: "x",
                data: [{ chrom: "chr1", start: 100, sequence: "ACG" }],
            }),
        },
        transform: [
            {
                type: "flattenSequence",
                field: "sequence",
                as: ["rawPos", "base"],
            },
            { type: "formula", expr: "datum.start + datum.rawPos", as: "pos" },
            {
                type: "coordinateLookup",
                from: {
                    data: {
                        lazy: /** @type {any} */ ({
                            type: "mockLazy",
                            channel: "x",
                            data: [
                                { chrom: "chr1", start: 100, score: 0.2 },
                                { chrom: "chr1", start: 101, score: 0.8 },
                            ],
                        }),
                    },
                    // The side input need not already expose the lookup key.
                    transform: [
                        { type: "formula", expr: "datum.start", as: "pos" },
                    ],
                },
                coordinate: { chrom: "chrom", pos: "pos" },
                key: ["chrom", "pos"],
                values: ["score"],
            },
        ],
        scales: {
            x: {
                domain: [
                    { chrom: "chr1", pos: 100 },
                    { chrom: "chr1", pos: 103 },
                ],
            },
            y: { domain: [0, 1] },
        },
        mark: "point",
        encoding: {
            x: { chrom: "chrom", pos: "pos", type: "locus" },
            y: { field: "score", type: "quantitative" },
        },
    });

    const dataSources = context.dataFlow.dataSources;
    const sequenceSource = /** @type {MockLazySource} */ (
        view.flowHandle.dataSource
    );
    const signalSource = /** @type {MockLazySource} */ (
        dataSources.find((source) => source !== sequenceSource)
    );
    const domain = view.getScaleResolution("x").getDomain();

    sequenceSource.requestDataForDomain(domain);

    await vi.waitFor(() => {
        expect([...view.flowHandle.collector.getData()]).toMatchObject([
            { pos: 100, base: "A", score: 0.2 },
            { pos: 101, base: "C", score: 0.8 },
            { pos: 102, base: "G", score: null },
        ]);
    });

    signalSource.params.data = [
        { chrom: "chr1", start: 100, score: 0.4 },
        { chrom: "chr1", start: 101, score: 0.6 },
    ];
    signalSource.requestDataForDomain(domain);

    await vi.waitFor(() => {
        expect([...view.flowHandle.collector.getData()]).toMatchObject([
            { pos: 100, base: "A", score: 0.4 },
            { pos: 101, base: "C", score: 0.6 },
            { pos: 102, base: "G", score: null },
        ]);
    });
});

test("replays eager primary data after the lazy side input arrives", async () => {
    unregisters.push(
        registerLazyDataSource(
            (params) => /** @type {any} */ (params).type == "mockLazy",
            MockLazySource
        )
    );

    const { view } = await createHeadlessEngine({
        assembly: "hg38",
        data: { values: [{ chrom: "chr1", pos: 100, base: "A" }] },
        transform: [
            {
                type: "coordinateLookup",
                from: {
                    data: {
                        lazy: /** @type {any} */ ({
                            type: "mockLazy",
                            channel: "x",
                            data: [{ chrom: "chr1", pos: 100, score: 0.5 }],
                        }),
                    },
                },
                coordinate: { chrom: "chrom", pos: "pos" },
                key: ["chrom", "pos"],
                values: ["score"],
            },
        ],
        scales: {
            x: {
                domain: [
                    { chrom: "chr1", pos: 100 },
                    { chrom: "chr1", pos: 101 },
                ],
            },
            y: { domain: [0, 1] },
        },
        mark: "point",
        encoding: {
            x: { chrom: "chrom", pos: "pos", type: "locus" },
            y: { field: "score", type: "quantitative" },
        },
    });

    await vi.waitFor(() => {
        expect([...view.flowHandle.collector.getData()]).toMatchObject([
            { chrom: "chr1", pos: 100, base: "A", score: 0.5 },
        ]);
    });
});

class TestLazySource extends SingleAxisLazySource {
    /** @param {any} view */
    constructor(view) {
        super(view, "x");
    }

    /** @param {number[]} _domain */
    onDomainChanged(_domain) {}

    /** @param {import("../flowNode.js").Datum[]} data */
    publish(data) {
        this.publishData([data]);
    }
}
