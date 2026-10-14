/** @typedef {{ __uniqueId: number, ordinal: number }} Datum */
/** @typedef {{ start: number, stop: number, facetId: number }} Facet */
/** @typedef {{ facets: Map<number, Datum[]>, boundaries: Facet[], length: number, getDatum: (position: number) => Datum | undefined }} Dataset */

import { bisector } from "d3-array";

/** @param {number} seed */
export function random(seed) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** @param {number[]} values @param {() => number} rng */
export function shuffle(values, rng) {
    for (let i = values.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
}

/** @param {number[]} ids @param {number} [facetCount] @returns {Dataset} */
export function fromIds(ids, facetCount = 8) {
    const facets = new Map();
    const boundaries = [];
    for (let f = 0; f < facetCount; f++) {
        const start = Math.floor((f * ids.length) / facetCount);
        const stop = Math.floor(((f + 1) * ids.length) / facetCount);
        const rows = new Array(stop - start);
        for (let i = start; i < stop; i++) {
            rows[i - start] = { __uniqueId: ids[i], ordinal: i };
        }
        facets.set(f, rows);
        boundaries.push({ start, stop, facetId: f });
    }
    const right = bisector((f) => f.start).right;
    return {
        facets,
        boundaries,
        length: ids.length,
        getDatum(position) {
            const facet = boundaries[right(boundaries, position) - 1];
            if (!facet || position >= facet.stop) {
                return;
            }
            return facets.get(facet.facetId)[position - facet.start];
        },
    };
}

export const scenarios = [
    "sorted",
    "shuffled",
    "blocks",
    "retain90",
    "retain50",
    "retain10",
    "retain1",
    "sparseBlocks",
    "streams",
    "mostlySorted",
    "unrelated",
    "largeIntegers",
    "uniform",
];

/**
 * n is the number of retained rows. Filtering generates geometric gaps from
 * Bernoulli retention without allocating the discarded source rows.
 * @param {string} scenario @param {number} n @param {number} [seed]
 */
export function generate(scenario, n, seed = 20261014) {
    const rng = random(seed);
    const ids = new Array(n);
    let source = 10000;
    const retention = scenario.startsWith("retain")
        ? Number(scenario.slice(6)) / 100
        : 1;
    for (let i = 0; i < n; i++) {
        switch (scenario) {
            case "retain90":
            case "retain50":
            case "retain10":
            case "retain1":
                source +=
                    Math.floor(Math.log(1 - rng()) / Math.log(1 - retention)) +
                    1;
                ids[i] = source;
                break;
            case "blocks":
                ids[i] = (Math.floor(i / 10000) * 7 + 1) * 10000 + (i % 10000);
                break;
            case "sparseBlocks":
                // Ten retained rows per reserved block; distant blocks belong
                // to other transforms/collectors (0.1% local block occupancy).
                ids[i] = (Math.floor(i / 10) * 17 + 1) * 10000 + (i % 10) * 997;
                break;
            case "streams": {
                // Four transforms reserve blocks in round-robin order, then
                // downstream data arrives interleaved one datum at a time.
                const stream = i % 4;
                const local = Math.floor(i / 4);
                ids[i] =
                    (Math.floor(local / 10000) * 4 + stream + 1) * 10000 +
                    (local % 10000);
                break;
            }
            case "largeIntegers":
                // Mixed widths, including the upper safe-integer boundary.
                ids[i] =
                    i % 3 === 0
                        ? 2 ** 31 + i
                        : i % 3 === 1
                          ? 2 ** 32 + i
                          : Number.MAX_SAFE_INTEGER - i;
                break;
            case "uniform":
                // Unique pseudo-uniform values over a 40-bit range. Odd
                // multiplication modulo 2^40 is injective for these sizes.
                ids[i] = (i * 1048573) % 2 ** 40;
                break;
            default:
                if (!scenarios.includes(scenario))
                    throw new Error("Unknown scenario: " + scenario);
                ids[i] = 10000 + i;
        }
    }
    if (
        [
            "shuffled",
            "blocks",
            "sparseBlocks",
            "largeIntegers",
            "uniform",
        ].includes(scenario)
    ) {
        shuffle(ids, rng);
    } else if (scenario === "mostlySorted") {
        for (let i = 0; i < Math.max(1, n / 1000); i++) {
            const a = Math.floor(rng() * n);
            const b = Math.floor(rng() * n);
            [ids[a], ids[b]] = [ids[b], ids[a]];
        }
    } else if (scenario === "unrelated") {
        // Sort by an independent precomputed field. Generation and the native
        // comparison sort are deliberately outside construction timing.
        const ranks = Float64Array.from({ length: n }, rng);
        ids.sort((a, b) => ranks[a - 10000] - ranks[b - 10000]);
    }
    return fromIds(ids);
}

/** @param {Dataset} data @param {number} count @param {number} [seed] @param {string} [scenario] */
export function queries(data, count, seed = 42, scenario = "shuffled") {
    const rng = random(seed);
    const hit = new Float64Array(count);
    const miss = new Float64Array(count);
    const mixed = new Float64Array(count);
    const same = new Float64Array(count);
    const nearby = new Float64Array(count);
    const center = Math.floor(data.length / 2);
    const centerId = data.getDatum(center).__uniqueId;
    let max = 0;
    for (const rows of data.facets.values()) {
        for (const row of rows) max = Math.max(max, row.__uniqueId);
    }
    /** @param {number} id */
    const containsSorted = (id) => {
        let lo = 0;
        let hi = data.length;
        while (lo < hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (data.getDatum(mid).__uniqueId < id) lo = mid + 1;
            else hi = mid;
        }
        return lo < data.length && data.getDatum(lo).__uniqueId === id;
    };
    for (let i = 0; i < count; i++) {
        const id = data.getDatum(Math.floor(rng() * data.length)).__uniqueId;
        hit[i] = id;
        // Integer misses in allocated gaps where possible. Dense ranges have
        // no internal misses, so query reserved block zero and the upper edge.
        if (scenario.startsWith("retain")) {
            let absent = id + 1;
            while (containsSorted(absent)) absent++;
            miss[i] = absent;
        } else if (scenario === "blocks" || scenario === "sparseBlocks") {
            miss[i] = Math.floor(id / 10000) * 10000 + 10000 + (i % 10000);
        } else if (scenario === "uniform") {
            miss[i] = 2 ** 42 + i;
        } else {
            miss[i] =
                i % 2 && max < Number.MAX_SAFE_INTEGER - count
                    ? max + 1 + i
                    : Math.floor(rng() * 10000);
        }
        mixed[i] = i % 2 ? hit[i] : miss[i];
        same[i] = centerId;
        // Numeric locality, not physical locality after unrelated sorting.
        nearby[i] = centerId - (i % 64);
    }
    return { hit, miss, mixed, same, nearby };
}
