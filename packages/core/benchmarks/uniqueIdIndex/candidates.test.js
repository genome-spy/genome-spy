import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import Collector from "../../src/data/collector.js";
import IdentifierTransform from "../../src/data/transforms/identifier.js";
import { build, candidateNames } from "./candidates.js";
import {
    fromIds,
    generate,
    queries,
    random,
    scenarios,
    shuffle,
} from "./data.js";
import { buildWasm } from "./wasm.js";

const wasm = new WebAssembly.Module(
    readFileSync(new URL("radix.wasm", import.meta.url))
);
const names = [...candidateNames, "wasm8"];

test("query batches contain integer hits and misses for every distribution", () => {
    for (const scenario of scenarios) {
        const data = generate(scenario, 1000);
        const expected = reference(data);
        const batches = queries(data, 1024, 41, scenario);
        for (const id of batches.hit) expect(expected.has(id)).toBe(true);
        for (const id of batches.miss) {
            expect(Number.isSafeInteger(id)).toBe(true);
            expect(id).toBeGreaterThanOrEqual(0);
            expect(expected.has(id)).toBe(false);
        }
        for (let i = 0; i < batches.mixed.length; i++) {
            expect(expected.has(batches.mixed[i])).toBe(Boolean(i % 2));
        }
    }
});

/** @param {string} name @param {import("./data.js").Dataset} data */
function index(name, data) {
    return name === "wasm8" ? buildWasm(wasm, data) : build(name, data);
}

/** @param {import("./data.js").Dataset} data */
function reference(data) {
    const expected = new Map();
    let p = 0;
    for (const rows of data.facets.values()) {
        for (const row of rows) {
            if (!expected.has(row.__uniqueId)) expected.set(row.__uniqueId, p);
            p++;
        }
    }
    return expected;
}

describe.each(names)("%s", (name) => {
    test("empty, singleton, gaps, duplicates and integer boundaries", () => {
        const cases = [
            [],
            [0],
            [Number.MAX_SAFE_INTEGER],
            [9, 4, 9, 1, 4],
            [
                2 ** 31 - 1,
                2 ** 31,
                2 ** 32 - 1,
                2 ** 32,
                2 ** 32 + 1,
                2 ** 44 - 1,
                2 ** 44,
                Number.MAX_SAFE_INTEGER - 1,
                Number.MAX_SAFE_INTEGER,
                0,
                7,
            ],
        ];
        for (const ids of cases) {
            const data = fromIds(ids);
            const expected = reference(data);
            const result = index(name, data);
            for (const id of [
                ...ids,
                -1,
                0.5,
                100,
                2 ** 40,
                Number.MAX_SAFE_INTEGER - 2,
            ]) {
                const p = expected.get(id) ?? -1;
                expect(result.position(id)).toBe(p);
                expect(result.find(id)).toBe(
                    p < 0 ? undefined : data.getDatum(p)
                );
            }
        }
    });

    test("deterministic randomized filtered/reordered collectors and rebuilding", () => {
        const rng = random(8080);
        for (let trial = 0; trial < 20; trial++) {
            const ids = shuffle(
                Array.from(
                    { length: 400 },
                    (_, i) =>
                        (i % 2 ? 2 ** 44 : 10000) +
                        Math.floor(rng() * 200) * 10000 +
                        i
                ),
                rng
            );
            for (const subset of [
                ids,
                ids.filter(() => rng() < 0.1),
                ids.slice().reverse(),
            ]) {
                const data = fromIds(subset, 13);
                const expected = reference(data);
                const result = index(name, data);
                for (const id of ids) {
                    const p = expected.get(id) ?? -1;
                    expect(result.position(id)).toBe(p);
                    expect(result.find(id)).toBe(
                        p < 0 ? undefined : data.getDatum(p)
                    );
                }
            }
        }
    });

    test("representative distributions resolve every datum", () => {
        for (const scenario of scenarios) {
            const data = generate(scenario, 300);
            const result = index(name, data);
            for (const rows of data.facets.values()) {
                for (const row of rows)
                    expect(result.find(row.__uniqueId)).toBe(row);
            }
        }
    });
});

test("lookup adapter agrees with real Collector grouping, sorting, reset, duplicates", () => {
    const collector = new Collector({
        type: "collect",
        groupby: ["group"],
        sort: { field: "rank" },
    });
    // Grouping and unrelated-field sorting deliberately change physical order;
    // duplicates in separate groups must resolve to the first current facet.
    const rows = [
        { __uniqueId: 2 ** 32 + 1, group: "b", rank: 3 },
        { __uniqueId: 7, group: "a", rank: 1 },
        { __uniqueId: 7, group: "b", rank: 2 },
        { __uniqueId: Number.MAX_SAFE_INTEGER, group: "a", rank: 4 },
    ];
    for (const selection of [rows, [rows[1], rows[3]]]) {
        collector.reset();
        for (const row of selection) collector.handle(row);
        collector.complete();
        const ordered = Array.from(collector.facetBatches.values()).flat();
        const data = fromIds(
            ordered.map((row) => row.__uniqueId),
            2
        );
        const expected = reference(data);
        for (const name of names) {
            const result = index(name, data);
            for (const id of [...rows.map((row) => row.__uniqueId), 0, -1]) {
                const p = expected.get(id);
                expect(result.position(id)).toBe(p ?? -1);
                expect(collector.findDatumByUniqueId(id)).toBe(
                    p === undefined ? undefined : ordered[p]
                );
                expect(result.find(id)?.__uniqueId).toBe(
                    collector.findDatumByUniqueId(id)?.__uniqueId
                );
            }
        }
    }
});

test("actual IdentifierTransform block reservations and resets", () => {
    const first = new IdentifierTransform({ type: "identifier" });
    const second = new IdentifierTransform({ type: "identifier" });
    const left = new Collector();
    const right = new Collector();
    first.addChild(left);
    second.addChild(right);
    for (let i = 0; i < 20005; i++) {
        first.handle({ value: i });
        second.handle({ value: i });
    }
    left.complete();
    right.complete();
    const ids = Array.from(left.getData(), (row) => row.__uniqueId);
    expect(ids[10000] - ids[9999]).toBe(10001);
    const subset = ids.filter((_, i) => i % 10 === 0).reverse();
    const data = fromIds(subset);
    for (const name of names) {
        const result = index(name, data);
        for (let i = 0; i < subset.length; i++)
            expect(result.position(subset[i])).toBe(i);
        expect(result.find(ids[1])).toBeUndefined();
    }
    first.reset();
    first.handle({ value: "reset" });
    expect(left.facetBatches.get(undefined)[0].__uniqueId).toBe(ids[0]);
});
