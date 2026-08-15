import { describe, expect, test } from "vitest";

import Collector from "./collector.js";
import { UNIQUE_ID_KEY } from "./transforms/identifier.js";
import { toRegularArray } from "../utils/domainArray.js";

const data = [1, 5, 2, 4, 3].map((x) => ({ x }));

/**
 * @param {string} fieldName
 * @param {import("../spec/channel.js").ChannelWithScale} channel
 * @returns {import("../types/encoder.js").ScaleAccessor<number>}
 */
function createAccessor(fieldName, channel) {
    const accessor =
        /** @type {import("../types/encoder.js").ScaleAccessor<number>} */ (
            (/** @type {Record<string, number>} */ datum) => datum[fieldName]
        );
    accessor.constant = false;
    accessor.channel = channel;
    accessor.scaleChannel = channel;
    accessor.sourceKey = "field|" + fieldName;
    accessor.domainKeyBase = channel + "|field|" + fieldName;
    accessor.channelDef = /** @type {any} */ ({
        field: fieldName,
        type: "quantitative",
    });
    return accessor;
}

test("Collector collects data", () => {
    const collector = new Collector();

    for (const d of data) {
        collector.handle(d);
    }
    collector.complete();

    expect(collector.getData()).toEqual(data);
});

test("Collector collects and sorts data", () => {
    const collector = new Collector({
        type: "collect",
        sort: { field: ["x"] },
    });

    for (const d of data) {
        collector.handle(d);
    }
    collector.complete();

    expect([...collector.getData()]).toEqual(
        [1, 2, 3, 4, 5].map((x) => ({ x }))
    );
});

test("Collector collects and sorts data in descending order", () => {
    const collector = new Collector({
        type: "collect",
        sort: { field: ["x"], order: "descending" },
    });

    for (const d of data) {
        collector.handle(d);
    }
    collector.complete();

    expect([...collector.getData()]).toEqual(
        [5, 4, 3, 2, 1].map((x) => ({ x }))
    );
});

test("Collector collects, groups, and sorts data", () => {
    const collector = new Collector({
        type: "collect",
        sort: { field: ["x"] },
        groupby: ["a", "b"],
    });

    const data = [
        { a: 1, b: 1, x: 1 },
        { a: 1, b: 2, x: 2 },
        { a: 1, b: 2, x: 3 },
        { a: 2, b: 1, x: 4 },
        { a: 2, b: 1, x: 5 },
        { a: 2, b: 2, x: 6 },
    ];

    for (const d of data) {
        collector.handle(d);
    }
    collector.complete();

    const cd = [...collector.getData()];

    expect(cd.map((d) => ({ x: d.x }))).toEqual(
        [1, 2, 3, 4, 5, 6].map((x) => ({ x }))
    );

    /** @param {any[]} group*/
    const getGroupX = (group) =>
        collector.facetBatches.get(group).map((d) => d.x);

    expect(getGroupX([1, 1])).toEqual([1]);
    expect(getGroupX([1, 2])).toEqual([2, 3]);
    expect(getGroupX([2, 1])).toEqual([4, 5]);
    expect(getGroupX([2, 2])).toEqual([6]);

    expect(new Set(collector.facetBatches.keys())).toEqual(
        new Set([
            [1, 1],
            [1, 2],
            [2, 1],
            [2, 2],
        ])
    );
});

test("Collector groups already faceted batches", () => {
    const collector = new Collector({
        type: "collect",
        groupby: ["sample"],
    });

    collector.beginBatch({ type: "facet", facetId: "A" });
    collector.handle({ sample: "A", x: 1 });
    collector.beginBatch({ type: "facet", facetId: "B" });
    collector.handle({ sample: "B", x: 2 });
    collector.handle({ sample: "B", x: 3 });
    collector.complete();

    expect([...collector.getData()]).toEqual([
        { sample: "A", x: 1 },
        { sample: "B", x: 2 },
        { sample: "B", x: 3 },
    ]);
    expect(collector.facetBatches.get(["A"])).toEqual([{ sample: "A", x: 1 }]);
    expect(collector.facetBatches.get(["B"])).toEqual([
        { sample: "B", x: 2 },
        { sample: "B", x: 3 },
    ]);
});

test("Collector throws on incomplete flow", () => {
    const collector = new Collector();

    expect(() => collector.getData()).toThrow();
});

describe("Indexing unique ids", () => {
    test("Collector builds a working index when ids are available", () => {
        const collector = new Collector({
            type: "collect",
            groupby: ["a"],
        });

        const data = [
            { a: 1, x: 1, [UNIQUE_ID_KEY]: 8 },
            { a: 1, x: 2, [UNIQUE_ID_KEY]: 2 },
            { a: 1, x: 3, [UNIQUE_ID_KEY]: 4 },
            { a: 1, x: 4, [UNIQUE_ID_KEY]: 6 },
            { a: 2, x: 5, [UNIQUE_ID_KEY]: 9 },
            { a: 2, x: 6, [UNIQUE_ID_KEY]: 7 },
            { a: 2, x: 7, [UNIQUE_ID_KEY]: 3 },
            { a: 2, x: 8, [UNIQUE_ID_KEY]: 1 },
        ];

        for (const d of data) {
            collector.handle(d);
        }
        collector.complete();

        expect(collector.findDatumByUniqueId(8)).toEqual(data[0]);
        expect(collector.findDatumByUniqueId(2)).toEqual(data[1]);
        expect(collector.findDatumByUniqueId(4)).toEqual(data[2]);
        expect(collector.findDatumByUniqueId(6)).toEqual(data[3]);
        expect(collector.findDatumByUniqueId(9)).toEqual(data[4]);
        expect(collector.findDatumByUniqueId(7)).toEqual(data[5]);
        expect(collector.findDatumByUniqueId(3)).toEqual(data[6]);
        expect(collector.findDatumByUniqueId(1)).toEqual(data[7]);
    });

    test("Collector returns undefined when ids are not available", () => {
        const collector = new Collector({
            type: "collect",
            groupby: ["a"],
        });

        const data = [
            { a: 1, x: 1 },
            { a: 2, x: 5 },
        ];

        for (const d of data) {
            collector.handle(d);
        }
        collector.complete();

        expect(collector.findDatumByUniqueId(0)).toBeUndefined();
    });
});

describe("Viewport domains", () => {
    const x = createAccessor("x", "x");
    const x2 = createAccessor("x2", "x2");
    const y = createAccessor("y", "y");
    const size = createAccessor("size", "size");

    test("uses exact point and half-open interval boundaries", () => {
        const collector = new Collector();
        const values = [
            { x: 0, x2: 2, y: 10 },
            { x: 2, x2: 4, y: 20 },
            { x: 3, x2: 3, y: 30 },
            { x: 4, x2: 5, y: 40 },
        ];
        for (const datum of values) {
            collector.handle(datum);
        }
        collector.complete();

        const domain = collector.getViewportDomain(
            "quantitative|y|field|y",
            "quantitative",
            y,
            [{ channel: "x", domain: [2, 3], accessor: x, accessor2: x2 }]
        );

        expect(toRegularArray(domain)).toEqual([20, 30]);
        expect(collector.getViewportIndexCount()).toBe(0);
    });

    test.each(["ascending", "descending"])(
        "builds an index for %s x-sorted points",
        (order) => {
            const collector = new Collector({
                type: "collect",
                sort: {
                    field: "x",
                    order: /** @type {"ascending" | "descending"} */ (order),
                },
            });
            for (let i = 0; i < 800; i++) {
                collector.handle({ x: i, y: i });
            }
            collector.complete();

            expect(collector.getViewportIndexCount()).toBe(0);
            const domain = collector.getViewportDomain(
                "quantitative|y|field|y",
                "quantitative",
                y,
                [{ channel: "x", domain: [256, 511], accessor: x }]
            );

            expect(toRegularArray(domain)).toEqual([256, 511]);
            expect(collector.getViewportIndexCount()).toBe(1);
        }
    );

    test("uses x candidates and exact y filtering for scatter plots", () => {
        const collector = new Collector({
            type: "collect",
            sort: { field: "x" },
        });
        for (let i = 0; i < 600; i++) {
            collector.handle({ x: i, y: i % 10, size: i });
        }
        collector.complete();

        const domain = collector.getViewportDomain(
            "quantitative|size|field|size",
            "quantitative",
            size,
            [
                { channel: "x", domain: [256, 511], accessor: x },
                { channel: "y", domain: [3, 5], accessor: y },
            ]
        );

        expect(toRegularArray(domain)).toEqual([263, 505]);
        expect(collector.getViewportIndexCount()).toBe(1);
    });

    test("indexes x-sorted intervals without changing overlap semantics", () => {
        const collector = new Collector({
            type: "collect",
            sort: { field: "x" },
        });
        for (let i = 0; i < 600; i++) {
            collector.handle({ x: i, x2: i + 10, y: i });
        }
        collector.complete();

        const domain = collector.getViewportDomain(
            "quantitative|y|field|y",
            "quantitative",
            y,
            [
                {
                    channel: "x",
                    domain: [256, 512],
                    accessor: x,
                    accessor2: x2,
                },
            ]
        );

        expect(toRegularArray(domain)).toEqual([247, 511]);
        expect(collector.getViewportIndexCount()).toBe(1);
    });

    test("unions facet batches and reuses the x blocks for another target", () => {
        const collector = new Collector({
            type: "collect",
            sort: { field: "x" },
        });
        collector.beginBatch({ type: "facet", facetId: "A" });
        collector.handle({ x: 0, y: 10, size: 100 });
        collector.beginBatch({ type: "facet", facetId: "B" });
        collector.handle({ x: 1, y: 20, size: 200 });
        collector.complete();
        const constraints = [
            {
                channel: /** @type {"x"} */ ("x"),
                domain: /** @type {[number, number]} */ ([0, 1]),
                accessor: x,
            },
        ];

        const yDomain = collector.getViewportDomain(
            "quantitative|y|field|y",
            "quantitative",
            y,
            constraints
        );
        const sizeDomain = collector.getViewportDomain(
            "quantitative|size|field|size",
            "quantitative",
            size,
            constraints
        );

        expect(toRegularArray(yDomain)).toEqual([10, 20]);
        expect(toRegularArray(sizeDomain)).toEqual([100, 200]);
        expect(collector.getViewportIndexCount()).toBe(1);
    });

    test("matches the exact scan for representative interval viewports", () => {
        const values = Array.from({ length: 1024 }, (_, i) => ({
            x: i,
            x2: i + 1 + (i % 7),
            y: Math.sin(i),
        }));
        /** @param {boolean} sorted */
        const makeCollector = (sorted) => {
            const collector = new Collector(
                sorted ? { type: "collect", sort: { field: "x" } } : undefined
            );
            for (const datum of values) {
                collector.handle(datum);
            }
            collector.complete();
            return collector;
        };
        const indexed = makeCollector(true);
        const exact = makeCollector(false);

        for (const domain of /** @type {[number, number][]} */ ([
            [0, 1],
            [255, 512],
            [1000, 900],
        ])) {
            const constraints = [
                { channel: "x", domain, accessor: x, accessor2: x2 },
            ];
            /** @param {Collector} collector */
            const query = (collector) =>
                toRegularArray(
                    collector.getViewportDomain(
                        "quantitative|y|field|y",
                        "quantitative",
                        y,
                        /** @type {any} */ (constraints)
                    )
                );

            expect(query(indexed)).toEqual(query(exact));
        }
    });

    test("rebuilds an enabled index when collector data change", () => {
        const collector = new Collector({
            type: "collect",
            sort: { field: "x" },
        });
        collector.handle({ x: 0, y: 1 });
        collector.complete();
        collector.getViewportDomain(
            "quantitative|y|field|y",
            "quantitative",
            y,
            [{ channel: "x", domain: [0, 1], accessor: x }]
        );

        collector.reset();
        collector.handle({ x: 0, y: 7 });
        collector.complete();
        const domain = collector.getViewportDomain(
            "quantitative|y|field|y",
            "quantitative",
            y,
            [{ channel: "x", domain: [0, 1], accessor: x }]
        );

        expect(toRegularArray(domain)).toEqual([7, 7]);
        expect(collector.getViewportIndexCount()).toBe(1);
    });
});

describe("Indexing key fields", () => {
    test("Collector finds data by key tuples", () => {
        const collector = new Collector();
        const data = [
            { id: "a", x: 1 },
            { id: "b", x: 2 },
        ];

        for (const d of data) {
            collector.handle(d);
        }
        collector.complete();

        expect(collector.findDatumByKey(["id"], ["a"])).toEqual(data[0]);
        expect(collector.findDatumByKey(["id"], ["missing"])).toBeUndefined();
    });

    test("Collector throws on duplicate keys when index is built", () => {
        const collector = new Collector();
        const data = [
            { id: "a", x: 1 },
            { id: "a", x: 2 },
        ];

        for (const d of data) {
            collector.handle(d);
        }
        collector.complete();

        expect(() => collector.findDatumByKey(["id"], ["a"])).toThrow(
            /Duplicate key/
        );
    });

    test("Collector rebuilds key index after reset", () => {
        const collector = new Collector();
        const data = [{ id: "a", x: 1 }];

        for (const d of data) {
            collector.handle(d);
        }
        collector.complete();

        expect(collector.findDatumByKey(["id"], ["a"])).toEqual(data[0]);

        collector.reset();

        const data2 = [{ id: "a", x: 2 }];
        for (const d of data2) {
            collector.handle(d);
        }
        collector.complete();

        expect(collector.findDatumByKey(["id"], ["a"])).toEqual(data2[0]);
    });

    test("Collector finds data by composite key tuples", () => {
        const collector = new Collector();
        const data = [
            { sampleId: "S1", chrom: "chr1", pos: 10 },
            { sampleId: "S2", chrom: "chr2", pos: 20 },
        ];

        for (const d of data) {
            collector.handle(d);
        }
        collector.complete();

        expect(
            collector.findDatumByKey(
                ["sampleId", "chrom", "pos"],
                ["S1", "chr1", 10]
            )
        ).toEqual(data[0]);
        expect(
            collector.findDatumByKey(
                ["sampleId", "chrom", "pos"],
                ["S1", "chr1", 999]
            )
        ).toBeUndefined();
    });

    test("Collector throws on duplicate composite keys when index is built", () => {
        const collector = new Collector();
        const data = [
            { sampleId: "S1", chrom: "chr1", pos: 10 },
            { sampleId: "S1", chrom: "chr1", pos: 10 },
        ];

        for (const d of data) {
            collector.handle(d);
        }
        collector.complete();

        expect(() =>
            collector.findDatumByKey(
                ["sampleId", "chrom", "pos"],
                ["S1", "chr1", 10]
            )
        ).toThrow(/Duplicate key/);
    });

    test("Collector throws when key field values are nullish", () => {
        const collector = new Collector();
        const data = [{ id: /** @type {string | undefined} */ (undefined) }];

        for (const d of data) {
            collector.handle(d);
        }
        collector.complete();

        expect(() => collector.findDatumByKey(["id"], ["x"])).toThrow(
            /undefined/
        );
    });
});

describe("Domain caching and notifications", () => {
    test("Collector caches domains by key", () => {
        const collector = new Collector();
        for (const d of data) {
            collector.handle(d);
        }
        collector.complete();

        // Count calls to verify that domains are computed once per key.
        let calls = 0;
        const accessor = createTestAccessor(
            (/** @type {{ x: number }} */ datum) => {
                calls += 1;
                return datum.x;
            }
        );

        const first = collector.getDomain("key", "quantitative", accessor);
        const second = collector.getDomain("key", "quantitative", accessor);

        expect(toRegularArray(first)).toEqual([1, 5]);
        expect(first).toBe(second);
        expect(calls).toBe(data.length);
    });

    test("Collector clears cached domains on updates", () => {
        const collector = new Collector();
        for (const d of data) {
            collector.handle(d);
        }
        collector.complete();

        let calls = 0;
        const accessor = createTestAccessor(
            (/** @type {{ x: number }} */ datum) => {
                calls += 1;
                return datum.x;
            }
        );

        collector.getDomain("key", "quantitative", accessor);
        expect(calls).toBe(data.length);

        collector.reset();
        collector.handle({ x: 10 });
        collector.handle({ x: 20 });
        collector.complete();

        collector.getDomain("key", "quantitative", accessor);
        expect(calls).toBe(data.length + 2);
    });

    test("Collector domain subscriptions notify and unregister", () => {
        const collector = new Collector();

        let calls = 0;
        const unregister = collector.subscribeDomainChanges("key", () => {
            calls += 1;
        });

        collector.handle({ x: 1 });
        collector.complete();

        expect(calls).toBe(1);

        unregister();
        collector.repropagate();

        expect(calls).toBe(1);
    });

    test("Collector observers are notified after repropagation", () => {
        const collector = new Collector();
        let calls = 0;
        collector.observe(() => {
            calls += 1;
        });

        collector.handle({ x: 1 });
        collector.complete();
        collector.repropagate();

        expect(calls).toBe(2);
    });
});

/**
 * @param {(datum: { x: number }) => number} fn
 * @returns {import("../types/encoder.js").Accessor<number>}
 */
function createTestAccessor(fn) {
    const accessor =
        /** @type {import("../types/encoder.js").Accessor<number>} */ (fn);
    accessor.asNumberAccessor = () => accessor;
    accessor.constant = false;
    accessor.fields = ["x"];
    accessor.channel = "x";
    accessor.scaleChannel = "x";
    accessor.channelDef =
        /** @type {import("../spec/channel.js").FieldDef} */ ({
            field: "x",
            type: "quantitative",
        });
    accessor.domainKeyBase = "x|field|x";
    return accessor;
}
