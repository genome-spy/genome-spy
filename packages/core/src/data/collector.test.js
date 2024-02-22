import { describe, expect, test } from "vitest";

import Collector from "./collector.js";
import { UNIQUE_ID_KEY } from "./transforms/identifier.js";

const data = [1, 5, 2, 4, 3].map((x) => ({ x }));

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
