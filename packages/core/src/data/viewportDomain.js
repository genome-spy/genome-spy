import { asArray } from "../utils/arrayUtils.js";
import createDomain from "../utils/domainArray.js";

const BLOCK_SIZE = 256;

/**
 * @typedef {object} ViewportConstraint
 * @property {"x" | "y"} channel
 * @property {[number, number]} domain
 * @property {import("../types/encoder.js").Accessor} accessor
 * @property {import("../types/encoder.js").Accessor} [accessor2]
 */

/**
 * @typedef {object} TargetSummary
 * @property {Float64Array} min
 * @property {Float64Array} max
 * @property {Uint8Array} valid
 * @property {Uint8Array} uncertain
 */

/**
 * @typedef {object} BlockBatch
 * @property {import("./flowNode.js").Data} data
 * @property {Float64Array} minStart
 * @property {Float64Array} maxStart
 * @property {Float64Array} minEnd
 * @property {Float64Array} maxEnd
 * @property {Uint8Array} uncertain
 * @property {Map<string, TargetSummary>} targets
 */

/**
 * @typedef {object} ViewportIndex
 * @property {import("../types/encoder.js").Accessor} accessor
 * @property {import("../types/encoder.js").Accessor | undefined} accessor2
 * @property {Map<string, import("../types/encoder.js").Accessor>} targets
 * @property {BlockBatch[] | undefined} batches
 */

/**
 * Owns the optional datum-level block summaries used by viewport-derived scale
 * domains. Collector delegates lifecycle events here to keep collection and
 * indexing responsibilities separate.
 */
export default class ViewportDomainManager {
    /** @type {Map<string, ViewportIndex>} */
    #indexes = new Map();

    /**
     * @param {import("../spec/transform.js").CollectParams} params
     * @param {() => Iterable<import("./flowNode.js").Data>} getBatches
     * @param {() => boolean} isCompleted
     */
    constructor(params, getBatches, isCompleted) {
        this.sortField = asArray(params.sort?.field)[0];
        this.getBatches = getBatches;
        this.isCompleted = isCompleted;
    }

    reset() {
        for (const index of this.#indexes.values()) {
            index.batches = undefined;
        }
    }

    complete() {
        for (const index of this.#indexes.values()) {
            index.batches = buildIndex(this.getBatches(), index);
        }
    }

    /**
     * @param {string} domainKey
     * @param {import("../spec/channel.js").Type} type
     * @param {import("../types/encoder.js").Accessor} targetAccessor
     * @param {ViewportConstraint[]} constraints
     * @returns {import("../utils/domainArray.js").DomainArray}
     */
    getDomain(domainKey, type, targetAccessor, constraints) {
        const xConstraint = constraints.find(
            (constraint) => constraint.channel === "x"
        );
        if (!xConstraint || !this.#isIndexEligible(xConstraint)) {
            return scanDomain(
                this.getBatches(),
                type,
                targetAccessor,
                constraints
            );
        }

        const indexKey = getIndexKey(xConstraint);
        let index = this.#indexes.get(indexKey);
        if (!index) {
            index = {
                accessor: xConstraint.accessor,
                accessor2: xConstraint.accessor2,
                targets: new Map(),
                batches: undefined,
            };
            this.#indexes.set(indexKey, index);
        }

        if (constraints.length === 1) {
            const previousTarget = index.targets.get(domainKey);
            if (previousTarget !== targetAccessor) {
                index.targets.set(domainKey, targetAccessor);
                if (index.batches) {
                    addTargetSummary(index.batches, domainKey, targetAccessor);
                }
            }
        }

        if (!index.batches && this.isCompleted()) {
            index.batches = buildIndex(this.getBatches(), index);
        }

        return index.batches
            ? queryIndex(index, domainKey, type, targetAccessor, constraints)
            : createDomain(type);
    }

    /** @internal */
    getIndexCount() {
        let count = 0;
        for (const index of this.#indexes.values()) {
            count += Number(index.batches !== undefined);
        }
        return count;
    }

    /** @param {ViewportConstraint} constraint */
    #isIndexEligible(constraint) {
        const channelDef = constraint.accessor.channelDef;
        const xField = "field" in channelDef ? channelDef.field : undefined;
        return typeof xField === "string" && this.sortField === xField;
    }
}

/** @param {ViewportConstraint} constraint */
function getIndexKey(constraint) {
    return (
        constraint.accessor.sourceKey +
        "|" +
        (constraint.accessor2?.sourceKey ?? "point")
    );
}

/**
 * @param {Iterable<import("./flowNode.js").Data>} batches
 * @param {ViewportIndex} index
 * @returns {BlockBatch[]}
 */
function buildIndex(batches, index) {
    const blockBatches = Array.from(batches, (data) =>
        buildBlockBatch(data, index)
    );
    for (const [key, accessor] of index.targets) {
        addTargetSummary(blockBatches, key, accessor);
    }
    return blockBatches;
}

/**
 * @param {import("./flowNode.js").Data} data
 * @param {ViewportIndex} config
 * @returns {BlockBatch}
 */
function buildBlockBatch(data, config) {
    const blockCount = Math.ceil(data.length / BLOCK_SIZE);
    const minStart = filledFloat64Array(blockCount, Infinity);
    const maxStart = filledFloat64Array(blockCount, -Infinity);
    const minEnd = filledFloat64Array(blockCount, Infinity);
    const maxEnd = filledFloat64Array(blockCount, -Infinity);
    const uncertain = new Uint8Array(blockCount);

    for (let i = 0; i < data.length; i++) {
        const block = Math.floor(i / BLOCK_SIZE);
        const interval = readInterval(
            data[i],
            config.accessor,
            config.accessor2
        );

        if (!interval) {
            uncertain[block] = 1;
        } else {
            minStart[block] = Math.min(minStart[block], interval.start);
            maxStart[block] = Math.max(maxStart[block], interval.start);
            minEnd[block] = Math.min(minEnd[block], interval.end);
            maxEnd[block] = Math.max(maxEnd[block], interval.end);

            if (config.accessor2 && interval.start === interval.end) {
                uncertain[block] = 1;
            }
        }
    }

    return {
        data,
        minStart,
        maxStart,
        minEnd,
        maxEnd,
        uncertain,
        targets: new Map(),
    };
}

/**
 * @param {number} length
 * @param {number} value
 */
function filledFloat64Array(length, value) {
    const array = new Float64Array(length);
    array.fill(value);
    return array;
}

/**
 * @param {BlockBatch[]} batches
 * @param {string} domainKey
 * @param {import("../types/encoder.js").Accessor} accessor
 */
function addTargetSummary(batches, domainKey, accessor) {
    for (const batch of batches) {
        const blockCount = Math.ceil(batch.data.length / BLOCK_SIZE);
        const summary = {
            min: filledFloat64Array(blockCount, Infinity),
            max: filledFloat64Array(blockCount, -Infinity),
            valid: new Uint8Array(blockCount),
            uncertain: new Uint8Array(blockCount),
        };
        batch.targets.set(domainKey, summary);

        for (let i = 0; i < batch.data.length; i++) {
            const value = accessor(batch.data[i]);
            if (value === null || value === undefined || Number.isNaN(value)) {
                continue;
            }

            const block = Math.floor(i / BLOCK_SIZE);
            const numericValue = +value;
            if (Number.isNaN(numericValue)) {
                summary.uncertain[block] = 1;
            } else {
                summary.valid[block] = 1;
                summary.min[block] = Math.min(summary.min[block], numericValue);
                summary.max[block] = Math.max(summary.max[block], numericValue);
            }
        }
    }
}

/**
 * @param {ViewportIndex} index
 * @param {string} domainKey
 * @param {import("../spec/channel.js").Type} type
 * @param {import("../types/encoder.js").Accessor} targetAccessor
 * @param {ViewportConstraint[]} constraints
 */
function queryIndex(index, domainKey, type, targetAccessor, constraints) {
    if (!index.batches) {
        throw new Error("Viewport index has not been built.");
    }

    const normalizedConstraints = constraints.map(normalizeConstraint);
    const xConstraint = normalizedConstraints.find(
        (constraint) => constraint.channel === "x"
    );
    const domain = createDomain(type);

    for (const batch of index.batches) {
        const blockCount = Math.ceil(batch.data.length / BLOCK_SIZE);
        for (let block = 0; block < blockCount; block++) {
            const uncertain = batch.uncertain[block] === 1;
            if (
                !uncertain &&
                isBlockDisjoint(
                    batch,
                    block,
                    xConstraint.domain,
                    Boolean(index.accessor2)
                )
            ) {
                continue;
            }

            if (
                normalizedConstraints.length === 1 &&
                !uncertain &&
                isBlockFullyVisible(
                    batch,
                    block,
                    xConstraint.domain,
                    Boolean(index.accessor2)
                )
            ) {
                const summary = batch.targets.get(domainKey);
                if (summary && summary.uncertain[block] === 0) {
                    if (summary.valid[block] === 1) {
                        domain.extend(summary.min[block]);
                        domain.extend(summary.max[block]);
                    }
                    continue;
                }
            }

            const start = block * BLOCK_SIZE;
            scanRows(
                batch.data,
                start,
                Math.min(start + BLOCK_SIZE, batch.data.length),
                domain,
                targetAccessor,
                normalizedConstraints
            );
        }
    }

    return domain;
}

/**
 * @param {Iterable<import("./flowNode.js").Data>} batches
 * @param {import("../spec/channel.js").Type} type
 * @param {import("../types/encoder.js").Accessor} targetAccessor
 * @param {ViewportConstraint[]} constraints
 */
function scanDomain(batches, type, targetAccessor, constraints) {
    const domain = createDomain(type);
    const normalizedConstraints = constraints.map(normalizeConstraint);
    for (const data of batches) {
        scanRows(
            data,
            0,
            data.length,
            domain,
            targetAccessor,
            normalizedConstraints
        );
    }
    return domain;
}

/**
 * @param {import("./flowNode.js").Data} data
 * @param {number} start
 * @param {number} end
 * @param {import("../utils/domainArray.js").DomainArray} domain
 * @param {import("../types/encoder.js").Accessor} targetAccessor
 * @param {ViewportConstraint[]} constraints
 */
function scanRows(data, start, end, domain, targetAccessor, constraints) {
    for (let i = start; i < end; i++) {
        const datum = data[i];
        if (constraints.every((constraint) => overlaps(datum, constraint))) {
            domain.extend(targetAccessor(datum));
        }
    }
}

/**
 * @param {ViewportConstraint} constraint
 * @returns {ViewportConstraint}
 */
function normalizeConstraint(constraint) {
    const start = Math.min(constraint.domain[0], constraint.domain[1]);
    const end = Math.max(constraint.domain[0], constraint.domain[1]);
    return { ...constraint, domain: [start, end] };
}

/**
 * @param {import("./flowNode.js").Datum} datum
 * @param {ViewportConstraint} constraint
 */
function overlaps(datum, constraint) {
    const interval = readInterval(
        datum,
        constraint.accessor,
        constraint.accessor2
    );
    if (!interval) {
        return false;
    }

    const [lo, hi] = constraint.domain;
    return interval.start === interval.end
        ? interval.start >= lo && interval.start <= hi
        : interval.start < hi && interval.end > lo;
}

/**
 * @param {import("./flowNode.js").Datum} datum
 * @param {import("../types/encoder.js").Accessor} accessor
 * @param {import("../types/encoder.js").Accessor} [accessor2]
 * @returns {{ start: number, end: number } | undefined}
 */
function readInterval(datum, accessor, accessor2) {
    const value = accessor(datum);
    const value2 = accessor2 ? accessor2(datum) : value;
    if (value == null || value2 == null) {
        return undefined;
    }

    const numericValue = +value;
    const numericValue2 = +value2;
    if (Number.isNaN(numericValue) || Number.isNaN(numericValue2)) {
        return undefined;
    }

    return {
        start: Math.min(numericValue, numericValue2),
        end: Math.max(numericValue, numericValue2),
    };
}

/**
 * @param {BlockBatch} batch
 * @param {number} block
 * @param {[number, number]} domain
 * @param {boolean} interval
 */
function isBlockDisjoint(batch, block, domain, interval) {
    const [lo, hi] = domain;
    return interval
        ? batch.maxEnd[block] <= lo || batch.minStart[block] >= hi
        : batch.maxStart[block] < lo || batch.minStart[block] > hi;
}

/**
 * @param {BlockBatch} batch
 * @param {number} block
 * @param {[number, number]} domain
 * @param {boolean} interval
 */
function isBlockFullyVisible(batch, block, domain, interval) {
    const [lo, hi] = domain;
    return interval
        ? batch.maxStart[block] < hi && batch.minEnd[block] > lo
        : batch.minStart[block] >= lo && batch.maxStart[block] <= hi;
}
