import { InternMap } from "internmap";
import { bisector, group } from "d3-array";
import { compare } from "vega-util";
import iterateNestedMaps from "../utils/iterateNestedMaps.js";
import FlowNode, { BEHAVIOR_COLLECTS, isFacetBatch } from "./flowNode.js";
import { field } from "../utils/field.js";
import { asArray } from "../utils/arrayUtils.js";
import { radixSortIntoLookupArray } from "../utils/radixSort.js";
import { UNIQUE_ID_KEY } from "./transforms/identifier.js";
import createDomain from "../utils/domainArray.js";
import KeyIndex from "./keyIndex.js";

const VIEWPORT_BLOCK_SIZE = 256;

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
 * @typedef {object} ViewportBlockBatch
 * @property {import("./flowNode.js").Data} data
 * @property {Float64Array} minStart
 * @property {Float64Array} maxStart
 * @property {Float64Array} minEnd
 * @property {Float64Array} maxEnd
 * @property {Uint8Array} uncertain
 * @property {Map<string, TargetSummary>} targets
 */

/**
 * @typedef {object} ViewportIndexConfig
 * @property {import("../types/encoder.js").Accessor} accessor
 * @property {import("../types/encoder.js").Accessor | undefined} accessor2
 * @property {Map<string, import("../types/encoder.js").Accessor>} targets
 */

/**
 * @typedef {object} ViewportIndex
 * @property {ViewportIndexConfig} config
 * @property {ViewportBlockBatch[]} batches
 */

/**
 * Collects (materializes) the data that flows through this node.
 * The collected data can be optionally grouped and sorted.
 *
 * Grouping is primarily intended for handling faceted data.
 */
export default class Collector extends FlowNode {
    /**
     * @typedef {import("./flowNode.js").Datum} Datum
     * @typedef {import("./flowNode.js").Data} Data
     */

    /**
     * Current batch that is being collected.
     * @type {Data}
     */
    #buffer = [];

    #uniqueIdAccessor = field(UNIQUE_ID_KEY);

    /**
     * @type {number[]}
     */
    #uniqueIdIndex = [];

    /** @type {KeyIndex} */
    #keyIndex = new KeyIndex();

    /**
     * Start and end indices of all facets if they are concatenated into a single array.
     * Used together with the uniqueIdIndex for looking up data items by their unique id.
     * @type {{start: number, stop: number, facetId: import("../spec/channel.js").Scalar[]}[]}
     */
    #facetIndices;

    /**
     * @type {(a: Datum, b: Datum) => number}
     */
    #comparator;

    /** @type {DomainCache} */
    #domainCache = new DomainCache();

    /** @type {Map<string, ViewportIndexConfig>} */
    #viewportIndexConfigs = new Map();

    /** @type {Map<string, ViewportIndex>} */
    #viewportIndexes = new Map();

    get behavior() {
        return BEHAVIOR_COLLECTS;
    }

    get label() {
        return "collect";
    }

    /**
     * @param {import("../spec/transform.js").CollectParams} [params]
     */
    constructor(params) {
        super();

        this.params = params ?? { type: "collect" };

        /** @type {Set<function(Collector):void>} */
        this.observers = new Set();

        // TODO: Consider nested maps instead of InternMap
        /** @type {Map<import("../spec/channel.js").Scalar[], Data>} TODO: proper type for key */
        this.facetBatches = new InternMap([], JSON.stringify);

        this.#comparator = makeComparator(this.params?.sort);

        this.#init();
    }

    #init() {
        this.#buffer = [];
        this.#uniqueIdIndex = [];
        this.#keyIndex.invalidate();
        this.#viewportIndexes.clear();

        this.facetBatches.clear();
        this.facetBatches.set(undefined, this.#buffer);
    }

    reset() {
        super.reset();
        this.#init();
    }

    /**
     * @param {Datum} datum
     */
    handle(datum) {
        this.#buffer.push(datum);
    }

    /**
     * @param {import("../types/flowBatch.js").FlowBatch} flowBatch
     */
    beginBatch(flowBatch) {
        this.#keyIndex.invalidate();

        if (isFacetBatch(flowBatch)) {
            this.#buffer = [];
            this.facetBatches.set(asArray(flowBatch.facetId), this.#buffer);
        }
    }

    complete() {
        // Free some memory
        this.#buffer = [];

        if (this.params.groupby?.length) {
            const accessors = this.params.groupby.map((fieldName) =>
                field(fieldName)
            );
            const data =
                this.facetBatches.size > 1
                    ? iterateFacetBatchData(this.facetBatches.values())
                    : this.facetBatches.get(undefined);
            const groups = groupData(data, accessors);

            this.facetBatches.clear();
            for (const [key, data] of iterateNestedMaps(groups)) {
                this.facetBatches.set(key, data);
            }
        }

        if (this.#comparator) {
            for (const data of this.facetBatches.values()) {
                // TODO: Only sort if not already sorted
                data.sort(this.#comparator);
            }
        }

        this.#rebuildViewportIndexes();

        this.#buildUniqueIdIndex();
        this.#propagateToChildren();

        super.complete();

        this.#invalidateDomains();
        this.#notifyObservers();
    }

    /**
     * @param {function(Collector):void} listener
     * @returns {() => void}
     */
    observe(listener) {
        this.observers.add(listener);
        return () => {
            this.observers.delete(listener);
        };
    }

    #propagateToChildren() {
        if (this.children.length) {
            for (const [facetId, data] of this.facetBatches.entries()) {
                if (facetId) {
                    /** @type {import("../types/flowBatch.js").FacetBatch} */
                    const facetBatch = { type: "facet", facetId };
                    for (const child of this.children) {
                        child.beginBatch(facetBatch);
                    }
                }
                for (let i = 0, n = data.length; i < n; i++) {
                    this._propagate(data[i]);
                }
            }
        }
    }

    repropagate() {
        for (const child of this.children) {
            child.reset();
        }

        this.#propagateToChildren();

        for (const child of this.children) {
            child.complete();
        }

        this.#invalidateDomains();
        this.#notifyObservers();
    }

    #notifyObservers() {
        for (const observer of this.observers) {
            observer(this);
        }
    }

    /**
     * @param {string} domainKey
     * @param {import("../spec/channel.js").Type} type
     * @param {import("../types/encoder.js").Accessor} accessor
     * @returns {import("../utils/domainArray.js").DomainArray}
     */
    getDomain(domainKey, type, accessor) {
        return this.#domainCache.getDomain(domainKey, () => {
            const domain = createDomain(type);

            if (accessor.constant) {
                domain.extend(accessor({}));
            } else if (this.completed) {
                for (const data of this.facetBatches.values()) {
                    for (let i = 0, n = data.length; i < n; i++) {
                        domain.extend(accessor(data[i]));
                    }
                }
            }

            return domain;
        });
    }

    /**
     * Calculates a target domain from rows that overlap the positional
     * viewport. X-sorted data use a flat block index; other data use the same
     * exact row predicate over the full collector.
     *
     * @param {string} domainKey
     * @param {import("../spec/channel.js").Type} type
     * @param {import("../types/encoder.js").Accessor} targetAccessor
     * @param {ViewportConstraint[]} constraints
     * @returns {import("../utils/domainArray.js").DomainArray}
     */
    getViewportDomain(domainKey, type, targetAccessor, constraints) {
        const xConstraint = constraints.find(
            (constraint) => constraint.channel === "x"
        );
        if (!xConstraint || !this.#isViewportIndexEligible(xConstraint)) {
            return scanViewportDomain(
                this.facetBatches.values(),
                type,
                targetAccessor,
                constraints
            );
        }

        const indexKey = getViewportIndexKey(xConstraint);
        let config = this.#viewportIndexConfigs.get(indexKey);
        if (!config) {
            config = {
                accessor: xConstraint.accessor,
                accessor2: xConstraint.accessor2,
                targets: new Map(),
            };
            this.#viewportIndexConfigs.set(indexKey, config);
        }

        const needsTargetSummary = constraints.length === 1;
        const previousTarget = config.targets.get(domainKey);
        if (needsTargetSummary && previousTarget !== targetAccessor) {
            config.targets.set(domainKey, targetAccessor);
            this.#viewportIndexes.delete(indexKey);
        }

        let index = this.#viewportIndexes.get(indexKey);
        if (!index && this.completed) {
            index = buildViewportIndex(this.facetBatches.values(), config);
            this.#viewportIndexes.set(indexKey, index);
        }

        return index
            ? queryViewportIndex(
                  index,
                  domainKey,
                  type,
                  targetAccessor,
                  constraints
              )
            : createDomain(type);
    }

    /**
     * Exposes conditional construction for focused contract tests and
     * diagnostics.
     *
     * @internal
     */
    getViewportIndexCount() {
        return this.#viewportIndexes.size;
    }

    /**
     * @param {ViewportConstraint} constraint
     */
    #isViewportIndexEligible(constraint) {
        const sortField = asArray(this.params.sort?.field)[0];
        const channelDef = constraint.accessor.channelDef;
        const xField = "field" in channelDef ? channelDef.field : undefined;
        return typeof xField === "string" && sortField === xField;
    }

    #rebuildViewportIndexes() {
        this.#viewportIndexes.clear();
        for (const [key, config] of this.#viewportIndexConfigs) {
            this.#viewportIndexes.set(
                key,
                buildViewportIndex(this.facetBatches.values(), config)
            );
        }
    }

    /**
     * @param {string} domainKey
     * @param {() => void} listener
     * @returns {() => void}
     */
    subscribeDomainChanges(domainKey, listener) {
        return this.#domainCache.subscribe(domainKey, listener);
    }

    /**
     * @returns {Iterable<Datum>}
     */
    getData() {
        this.#checkStatus();

        switch (this.facetBatches.size) {
            case 0:
                return [];
            case 1:
                return [...this.facetBatches.values()][0];
            default: {
                const groups = this.facetBatches;
                return {
                    [Symbol.iterator]: function* generator() {
                        for (const data of groups.values()) {
                            yield* data;
                        }
                    },
                };
            }
        }
    }

    /**
     *
     * @param {(datum: Datum) => void} visitor
     */
    visitData(visitor) {
        this.#checkStatus();

        for (const data of this.facetBatches.values()) {
            for (let i = 0; i < data.length; i++) {
                visitor(data[i]);
            }
        }
    }

    /**
     * Returns the total number of data items collected.
     */
    getItemCount() {
        let count = 0;
        for (const data of this.facetBatches.values()) {
            count += data.length;
        }
        return count;
    }

    #checkStatus() {
        if (!this.completed) {
            throw new Error(
                "Data propagation is not completed! No data are available."
            );
        }
    }

    #invalidateDomains() {
        if (this.#domainCache.hasCachedDomains()) {
            this.#domainCache.clear();
        }
        this.#domainCache.notify();
    }

    /**
     * Builds an index for looking up data items by their unique id.
     * Using a sorted index and binary search for O(log n) complexity.
     */
    #buildUniqueIdIndex() {
        this.#facetIndices = [];

        /** @type {Datum} */
        const obj = this.facetBatches.values().next().value?.[0];
        if (obj == null || !(UNIQUE_ID_KEY in obj)) {
            return; // No unique ids in the data
        }

        let cumulativePos = 0;

        /** @type {number[]} */
        const ids = [];

        const a = this.#uniqueIdAccessor;

        for (const [facetId, data] of this.facetBatches) {
            this.#facetIndices.push({
                start: cumulativePos,
                stop: cumulativePos + data.length,
                facetId,
            });
            cumulativePos += data.length;

            for (let i = 0, n = data.length; i < n; i++) {
                ids.push(a(data[i]));
            }
        }

        this.#uniqueIdIndex = radixSortIntoLookupArray(ids);
    }

    /**
     * Use an index to find a datum by its unique id.
     *
     * @param {number} uniqueId
     */
    findDatumByUniqueId(uniqueId) {
        if (!this.#uniqueIdIndex.length) {
            return;
        }

        const facetBisector = bisector((f) => f.start).right;
        const a = this.#uniqueIdAccessor;
        const indexBisector = bisector((i) => a(getDatum(i))).left;

        const getDatum = (/** @type {number} */ i) => {
            const fi = facetBisector(this.#facetIndices, i);
            const facet = this.#facetIndices[fi - 1];
            if (!facet || i >= facet.stop) {
                return;
            }
            const data = this.facetBatches.get(facet.facetId);
            return data[i - facet.start];
        };

        const index = indexBisector(this.#uniqueIdIndex, uniqueId);
        if (index >= 0) {
            const datum = getDatum(this.#uniqueIdIndex[index]);
            if (datum && a(datum) === uniqueId) {
                return datum;
            }
        }
    }

    /**
     * Uses a lazy index to find a datum by its key fields.
     *
     * @param {string[]} keyFields
     * @param {import("../spec/channel.js").Scalar[]} keyTuple
     */
    findDatumByKey(keyFields, keyTuple) {
        this.#checkStatus();
        return this.#keyIndex.findDatum(
            keyFields,
            keyTuple,
            this.facetBatches.values()
        );
    }
}

/**
 * @param {ViewportConstraint} constraint
 */
function getViewportIndexKey(constraint) {
    return (
        constraint.accessor.sourceKey +
        "|" +
        (constraint.accessor2?.sourceKey ?? "point")
    );
}

/**
 * @param {Iterable<import("./flowNode.js").Data>} batches
 * @param {ViewportIndexConfig} config
 * @returns {ViewportIndex}
 */
function buildViewportIndex(batches, config) {
    return {
        config,
        batches: Array.from(batches, (data) =>
            buildViewportBlockBatch(data, config)
        ),
    };
}

/**
 * @param {import("./flowNode.js").Data} data
 * @param {ViewportIndexConfig} config
 * @returns {ViewportBlockBatch}
 */
function buildViewportBlockBatch(data, config) {
    const blockCount = Math.ceil(data.length / VIEWPORT_BLOCK_SIZE);
    const minStart = createFilledFloat64Array(blockCount, Infinity);
    const maxStart = createFilledFloat64Array(blockCount, -Infinity);
    const minEnd = createFilledFloat64Array(blockCount, Infinity);
    const maxEnd = createFilledFloat64Array(blockCount, -Infinity);
    const uncertain = new Uint8Array(blockCount);

    /** @type {Map<string, TargetSummary>} */
    const targets = new Map();
    for (const key of config.targets.keys()) {
        targets.set(key, {
            min: createFilledFloat64Array(blockCount, Infinity),
            max: createFilledFloat64Array(blockCount, -Infinity),
            valid: new Uint8Array(blockCount),
            uncertain: new Uint8Array(blockCount),
        });
    }

    for (let i = 0; i < data.length; i++) {
        const block = Math.floor(i / VIEWPORT_BLOCK_SIZE);
        const datum = data[i];
        const interval = readDatumInterval(
            datum,
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

        for (const [key, accessor] of config.targets) {
            const summary = targets.get(key);
            const value = accessor(datum);
            if (value === null || value === undefined || Number.isNaN(value)) {
                continue;
            }

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

    return {
        data,
        minStart,
        maxStart,
        minEnd,
        maxEnd,
        uncertain,
        targets,
    };
}

/**
 * @param {number} length
 * @param {number} value
 */
function createFilledFloat64Array(length, value) {
    const array = new Float64Array(length);
    array.fill(value);
    return array;
}

/**
 * @param {ViewportIndex} index
 * @param {string} domainKey
 * @param {import("../spec/channel.js").Type} type
 * @param {import("../types/encoder.js").Accessor} targetAccessor
 * @param {ViewportConstraint[]} constraints
 */
function queryViewportIndex(
    index,
    domainKey,
    type,
    targetAccessor,
    constraints
) {
    const normalizedConstraints = constraints.map(normalizeConstraint);
    const xConstraint = normalizedConstraints.find(
        (constraint) => constraint.channel === "x"
    );
    const domain = createDomain(type);

    for (const batch of index.batches) {
        const blockCount = Math.ceil(batch.data.length / VIEWPORT_BLOCK_SIZE);
        for (let block = 0; block < blockCount; block++) {
            const uncertain = batch.uncertain[block] === 1;
            if (
                !uncertain &&
                isBlockDisjoint(
                    batch,
                    block,
                    xConstraint.domain,
                    Boolean(index.config.accessor2)
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
                    Boolean(index.config.accessor2)
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

            const start = block * VIEWPORT_BLOCK_SIZE;
            const end = Math.min(
                start + VIEWPORT_BLOCK_SIZE,
                batch.data.length
            );
            scanViewportRows(
                batch.data,
                start,
                end,
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
function scanViewportDomain(batches, type, targetAccessor, constraints) {
    const domain = createDomain(type);
    const normalizedConstraints = constraints.map(normalizeConstraint);
    for (const data of batches) {
        scanViewportRows(
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
function scanViewportRows(
    data,
    start,
    end,
    domain,
    targetAccessor,
    constraints
) {
    for (let i = start; i < end; i++) {
        const datum = data[i];
        if (
            constraints.every((constraint) =>
                datumOverlapsConstraint(datum, constraint)
            )
        ) {
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
function datumOverlapsConstraint(datum, constraint) {
    const interval = readDatumInterval(
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
function readDatumInterval(datum, accessor, accessor2) {
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
 * @param {ViewportBlockBatch} batch
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
 * @param {ViewportBlockBatch} batch
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

/**
 * Manages cached domains and subscriptions for invalidation.
 */
class DomainCache {
    /** @type {Map<string, import("../utils/domainArray.js").DomainArray>} */
    #cache = new Map();

    /** @type {Map<string, Set<() => void>>} */
    #observers = new Map();

    hasCachedDomains() {
        return this.#cache.size > 0;
    }

    clear() {
        this.#cache.clear();
    }

    /**
     * @param {string} domainKey
     * @param {() => import("../utils/domainArray.js").DomainArray} build
     * @returns {import("../utils/domainArray.js").DomainArray}
     */
    getDomain(domainKey, build) {
        const cached = this.#cache.get(domainKey);
        if (cached) {
            return cached;
        } else {
            const domain = build();
            this.#cache.set(domainKey, domain);
            return domain;
        }
    }

    /**
     * @param {string} domainKey
     * @param {() => void} listener
     * @returns {() => void}
     */
    subscribe(domainKey, listener) {
        let listeners = this.#observers.get(domainKey);
        if (!listeners) {
            listeners = new Set();
            this.#observers.set(domainKey, listeners);
        }
        listeners.add(listener);

        return () => {
            const entry = this.#observers.get(domainKey);
            if (!entry) {
                return;
            }
            entry.delete(listener);
            if (entry.size === 0) {
                this.#observers.delete(domainKey);
            }
        };
    }

    notify() {
        if (this.#observers.size === 0) {
            return;
        }

        /** @type {Set<() => void>} */
        const listeners = new Set();
        for (const observers of this.#observers.values()) {
            for (const observer of observers) {
                listeners.add(observer);
            }
        }

        for (const listener of listeners) {
            listener();
        }
    }
}

/**
 * @param {Iterable<Data>} batches
 * @returns {Iterable<Datum>}
 */
function iterateFacetBatchData(batches) {
    return {
        [Symbol.iterator]: function* generator() {
            for (const data of batches) {
                yield* data;
            }
        },
    };
}

/**
 * @param {Iterable<Datum>} data
 * @param {((data: Datum) => import("../spec/channel.js").Scalar)[]} accessors
 */
function groupData(data, accessors) {
    return accessors.length > 1
        ? // There's something strange in d3-array's typings
          /** @type {Map<any, any>} */ /** @type {any} */ (
              group(data, ...accessors)
          )
        : // D3's group is SLOW!
          groupBy(data, accessors[0]);
}

/**
 * Like D3's group but without InternMap, which is slow.
 * TODO: Implement multi-level grouping
 *
 * @param {Iterable<Datum>} data
 * @param {(data: Datum) => import("../spec/channel.js").Scalar} accessor
 */
function groupBy(data, accessor) {
    const groups = new Map();
    for (const datum of data) {
        const key = accessor(datum);
        let group = groups.get(key);
        if (!group) {
            group = [];
            groups.set(key, group);
        }
        group.push(datum);
    }
    return groups;
}

/**
 * Creates a comparator function based on the provided sort parameters.
 *
 * @param {import("../spec/transform.js").CompareParams} sort
 * @returns {(a: Datum, b: Datum) => number}
 */
function makeComparator(sort) {
    // For simple cases, create a simple comparator.
    // For more complex cases, use Vega's compare function. However,
    // is uses megamorphic field accessors, which makes it slow.
    if (sort?.field) {
        const fields = asArray(sort.field);
        if (fields.length == 1 && !fields[0].includes(".")) {
            const order = asArray(sort.order)[0] ?? "ascending";
            const fieldName = JSON.stringify(fields[0]);
            return /** @type {(a: Datum, b: Datum) => number} */ (
                new Function(
                    "a",
                    "b",
                    `return ${
                        order === "ascending"
                            ? `a[${fieldName}] - b[${fieldName}]`
                            : `b[${fieldName}] - a[${fieldName}]`
                    };`
                )
            );
        }

        return compare(sort.field, sort.order);
    }
}
