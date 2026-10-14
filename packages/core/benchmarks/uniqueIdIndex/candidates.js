import { bisector } from "d3-array";
import { field } from "../../src/utils/field.js";
import { radixSortIntoLookupArray } from "../../src/utils/radixSort.js";
import { radixSortIntoLookupArray as baselineRadixSort } from "./baselineRadixSort.js";

/** @typedef {import("./data.js").Dataset} Dataset */
/** @typedef {{ position: (id: number) => number, find: (id: number) => import("./data.js").Datum | undefined, retainedBytes: number | null, peakBytes: number | null, detail?: object }} Index */
/** @typedef {(phase: string) => void} Checkpoint */

/** @param {Dataset} data @param {Checkpoint} checkpoint */
export function materialize(data, checkpoint) {
    const ids = [];
    for (const rows of data.facets.values()) {
        for (const row of rows) ids.push(row.__uniqueId);
    }
    checkpoint("ids");
    return ids;
}

/**
 * The full lookup below follows Collector.findDatumByUniqueId verbatim:
 * construct both d3 bisectors per call, bisect facets for every comparator,
 * resolve through the facet Map, then check equality. Tests compare it to the
 * real Collector, including duplicate IDs and empty facets.
 * @param {Dataset} data @param {ArrayLike<number>} indexes
 * @param {number} retainedBytes @param {number} peakBytes @returns {Index}
 */
export function permutationIndex(data, indexes, retainedBytes, peakBytes) {
    const a = field("__uniqueId");
    return {
        retainedBytes,
        peakBytes,
        position(id) {
            const left = bisector((i) => a(data.getDatum(i))).left;
            const k = left(indexes, id);
            if (k === indexes.length) return -1;
            const p = indexes[k];
            return a(data.getDatum(p)) === id ? p : -1;
        },
        find(uniqueId) {
            if (!indexes.length) return;
            const facetBisector = bisector((f) => f.start).right;
            const indexBisector = bisector((i) => a(getDatum(i))).left;
            const getDatum = (i) => {
                const fi = facetBisector(data.boundaries, i);
                const facet = data.boundaries[fi - 1];
                if (!facet || i >= facet.stop) return;
                return data.facets.get(facet.facetId)[i - facet.start];
            };
            const index = indexBisector(indexes, uniqueId);
            if (index >= 0) {
                const datum = getDatum(indexes[index]);
                if (datum && a(datum) === uniqueId) return datum;
            }
        },
    };
}

/** @param {Dataset} data @param {(id: number) => number} position @param {number | null} retainedBytes @param {number | null} [peakBytes] @returns {Index} */
export function directIndex(
    data,
    position,
    retainedBytes,
    peakBytes = retainedBytes
) {
    return {
        retainedBytes,
        peakBytes,
        position,
        find(id) {
            const p = position(id);
            return p < 0 ? undefined : data.getDatum(p);
        },
    };
}

/** @param {number} value @param {number} shift @param {number} mask */
function digit(value, shift, mask) {
    // A digit crossing bit 31 must use arithmetic, including 11-bit digits
    // starting at bit 22. Powers of two divide safe integers exactly.
    return shift + Math.log2(mask + 1) <= 32
        ? (value >>> shift) & mask
        : Math.floor(value / 2 ** shift) & mask;
}

/** @param {ArrayLike<number>} ids */
function inspect(ids) {
    let sorted = true;
    let max = 0;
    for (let i = 0; i < ids.length; i++) {
        max = Math.max(max, ids[i]);
        if (i && ids[i] < ids[i - 1]) sorted = false;
    }
    return { sorted, max };
}

/** @param {number[]} ids @param {number} bits @param {boolean} typed @param {Checkpoint} checkpoint */
export function radixPermutation(ids, bits, typed, checkpoint) {
    const { sorted, max } = inspect(ids);
    let indexes = typed ? new Uint32Array(ids.length) : new Array(ids.length);
    for (let i = 0; i < ids.length; i++) indexes[i] = i;
    if (sorted) {
        checkpoint("sorted");
        return indexes;
    }
    let scratch = typed ? new Uint32Array(ids.length) : new Array(ids.length);
    const counts = new Uint32Array(2 ** bits);
    checkpoint("scratch");
    const mask = counts.length - 1;
    for (let shift = 0; shift < 53 && 2 ** shift <= max; shift += bits) {
        counts.fill(0);
        for (let i = 0; i < ids.length; i++)
            counts[digit(ids[indexes[i]], shift, mask)]++;
        let total = 0;
        for (let b = 0; b < counts.length; b++) {
            const count = counts[b];
            counts[b] = total;
            total += count;
        }
        for (let i = 0; i < ids.length; i++) {
            const p = indexes[i];
            scratch[counts[digit(ids[p], shift, mask)]++] = p;
        }
        [indexes, scratch] = [scratch, indexes];
    }
    checkpoint("sorted");
    return indexes;
}

/** @param {number[]} ids @param {boolean} interleaved @param {Checkpoint} checkpoint */
function radixPairs(ids, interleaved, checkpoint) {
    const { sorted, max } = inspect(ids);
    if (sorted) return Uint32Array.from({ length: ids.length }, (_, i) => i);
    let keys = interleaved
        ? new Float64Array(ids.length * 2)
        : Float64Array.from(ids);
    let positions = interleaved
        ? keys
        : Uint32Array.from({ length: ids.length }, (_, i) => i);
    let scratchKeys = new Float64Array(keys.length);
    let scratchPositions = interleaved
        ? scratchKeys
        : new Uint32Array(ids.length);
    if (interleaved) {
        for (let i = 0; i < ids.length; i++) {
            keys[i * 2] = ids[i];
            keys[i * 2 + 1] = i;
        }
    }
    const counts = new Uint32Array(256);
    checkpoint("scratch");
    const stride = interleaved ? 2 : 1;
    const offset = interleaved ? 1 : 0;
    for (let shift = 0; shift < 53 && 2 ** shift <= max; shift += 8) {
        counts.fill(0);
        for (let i = 0; i < ids.length; i++)
            counts[digit(keys[i * stride], shift, 255)]++;
        let total = 0;
        for (let b = 0; b < 256; b++) {
            const count = counts[b];
            counts[b] = total;
            total += count;
        }
        for (let i = 0; i < ids.length; i++) {
            const key = keys[i * stride];
            const p = counts[digit(key, shift, 255)]++;
            scratchKeys[p * stride] = key;
            scratchPositions[p * stride + offset] =
                positions[i * stride + offset];
        }
        [keys, scratchKeys] = [scratchKeys, keys];
        [positions, scratchPositions] = [scratchPositions, positions];
    }
    const result = interleaved
        ? Uint32Array.from(
              { length: ids.length },
              (_, i) => positions[i * 2 + 1]
          )
        : positions;
    checkpoint("sorted");
    return result;
}

/** @param {Dataset} data @param {boolean} hybrid @param {Checkpoint} checkpoint */
function blockIndex(data, hybrid, checkpoint) {
    // Sparse blocks retain offset/position pairs. Promote at 25% occupancy,
    // where a pair costs as much as a direct slot. Map is per block, not row.
    const directory = new Map();
    let p = 0;
    for (const rows of data.facets.values()) {
        for (const row of rows) {
            const id = row.__uniqueId;
            const block = Math.floor(id / 10000);
            const offset = id - block * 10000;
            let entry = directory.get(block);
            if (!entry) {
                entry = hybrid ? [] : new Uint32Array(10000);
                directory.set(block, entry);
            }
            if (hybrid) {
                entry.push(offset, p + 1);
            } else if (!entry[offset]) {
                entry[offset] = p + 1;
            }
            p++;
        }
    }
    checkpoint("blocks-built");
    let bytes = 0;
    if (hybrid) {
        for (const [block, pairs] of directory) {
            // Sort only within a 10K block, preserving first physical position.
            const order = Array.from({ length: pairs.length / 2 }, (_, i) => i);
            order.sort((a, b) => pairs[a * 2] - pairs[b * 2]);
            if (order.length >= 2500) {
                const dense = new Uint32Array(10000);
                for (const i of order) {
                    if (!dense[pairs[i * 2]])
                        dense[pairs[i * 2]] = pairs[i * 2 + 1];
                }
                directory.set(block, dense);
                bytes += dense.byteLength;
            } else {
                const sparse = new Uint32Array(pairs.length);
                for (let i = 0; i < order.length; i++) {
                    sparse[i * 2] = pairs[order[i] * 2];
                    sparse[i * 2 + 1] = pairs[order[i] * 2 + 1];
                }
                directory.set(block, { sparse });
                bytes += sparse.byteLength;
            }
        }
    } else {
        bytes = directory.size * 40000;
    }
    checkpoint("blocks-final");
    const result = directIndex(
        data,
        (id) => {
            if (!Number.isSafeInteger(id) || id < 0) return -1;
            const block = Math.floor(id / 10000);
            const offset = id - block * 10000;
            const entry = directory.get(block);
            if (!entry) return -1;
            if (entry instanceof Uint32Array) return entry[offset] - 1;
            const pairs = entry.sparse;
            let lo = 0;
            let hi = pairs.length / 2;
            while (lo < hi) {
                const mid = Math.floor((lo + hi) / 2);
                if (pairs[mid * 2] < offset) lo = mid + 1;
                else hi = mid;
            }
            return lo < pairs.length / 2 && pairs[lo * 2] === offset
                ? pairs[lo * 2 + 1] - 1
                : -1;
        },
        bytes,
        // Temporary JS pair/order arrays are measured, not payload-modeled.
        hybrid ? null : bytes
    );
    result.detail = {
        blocks: directory.size,
        directoryExcludedFromByteModel: true,
    };
    return result;
}

/** @param {number} id */
function hash(id) {
    let x = (id >>> 0) ^ Math.imul(Math.floor(id / 4294967296), 0x9e3779b1);
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return (x ^ (x >>> 16)) >>> 0;
}

/** @param {Dataset} data @param {number} load @param {Checkpoint} checkpoint */
function hashIndex(data, load, checkpoint) {
    // Exact capacity keeps the requested load factors distinct. Power-of-two
    // rounding would make 0.5 and 0.7 identical at many benchmark sizes.
    const capacity = Math.max(2, Math.ceil(data.length / load));
    const keys = new Float64Array(capacity);
    const positions = new Uint32Array(capacity);
    checkpoint("hash-allocated");
    let p = 0;
    for (const rows of data.facets.values()) {
        for (const row of rows) {
            const id = row.__uniqueId;
            let slot = hash(id) % capacity;
            while (positions[slot] && keys[slot] !== id) {
                if (++slot === capacity) slot = 0;
            }
            if (!positions[slot]) {
                keys[slot] = id;
                positions[slot] = p + 1;
            }
            p++;
        }
    }
    checkpoint("hash-built");
    const result = directIndex(
        data,
        (id) => {
            let slot = hash(id) % capacity;
            while (positions[slot]) {
                if (keys[slot] === id) return positions[slot] - 1;
                if (++slot === capacity) slot = 0;
            }
            return -1;
        },
        keys.byteLength + positions.byteLength
    );
    result.detail = { capacity, load: data.length / capacity };
    return result;
}

export const candidateNames = [
    "baseline",
    "production",
    "array4",
    "array8",
    "typed4",
    "typed8",
    "typed11",
    "pairs8",
    "interleaved8",
    "blocks",
    "hybridBlocks",
    "hash50",
    "hash70",
    "hash85",
    "map",
];

/** @param {string} name @param {Dataset} data @param {Checkpoint} [checkpoint] @returns {Index} */
export function build(name, data, checkpoint = () => {}) {
    if (data.length > 0xffffffff)
        throw new Error("Position exceeds Uint32 sentinel contract");
    if (name === "blocks" || name === "hybridBlocks")
        return blockIndex(data, name === "hybridBlocks", checkpoint);
    if (name.startsWith("hash"))
        return hashIndex(data, Number(name.slice(4)) / 100, checkpoint);
    if (name === "map") {
        const map = new Map();
        let p = 0;
        for (const rows of data.facets.values()) {
            for (const row of rows) {
                if (!map.has(row.__uniqueId)) map.set(row.__uniqueId, p);
                p++;
            }
        }
        checkpoint("map-built");
        // Map's retained allocation is measured, never guessed from entry size.
        return directIndex(data, (id) => map.get(id) ?? -1, null);
    }
    const ids = materialize(data, checkpoint);
    if (name === "baseline" || name === "production") {
        const production = name === "production";
        const indexes = production
            ? radixSortIntoLookupArray(ids)
            : baselineRadixSort(ids);
        checkpoint("sorted");
        return permutationIndex(
            data,
            indexes,
            (production ? 4 : 8) * data.length,
            production ? 16 * data.length + 8192 : 24 * data.length
        );
    }
    if (name === "pairs8" || name === "interleaved8") {
        const interleaved = name === "interleaved8";
        const indexes = radixPairs(ids, interleaved, checkpoint);
        return permutationIndex(
            data,
            indexes,
            4 * data.length,
            (interleaved ? 44 : 32) * data.length + 1024
        );
    }
    const typed = name.startsWith("typed");
    const bits = typed
        ? Number(name.slice(5))
        : name.startsWith("array")
          ? Number(name.slice(5))
          : NaN;
    if (![4, 8, 11].includes(bits))
        throw new Error("Unknown candidate: " + name);
    const indexes = radixPermutation(ids, bits, typed, checkpoint);
    return permutationIndex(
        data,
        indexes,
        (typed ? 4 : 8) * data.length,
        (typed ? 16 : 24) * data.length + 4 * 2 ** bits
    );
}
