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

const MULTI_KEY_SEPARATOR = "|";
const MULTI_KEY_ESCAPE = "\\";

/**
 * @param {unknown} value
 * @param {string[]} keyFields
 * @param {number} index
 * @returns {import("../spec/channel.js").Scalar}
 */
function validateKeyComponent(value, keyFields, index) {
    const fieldName = keyFields[index];
    if (value === undefined) {
        throw new Error(
            `Key field "${fieldName}" is undefined. Ensure all key fields are present in the data.`
        );
    }

    if (value === null) {
        throw new Error(
            `Key field "${fieldName}" is null. Ensure all key fields are present in the data.`
        );
    }

    if (
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
    ) {
        throw new Error(
            `Key field "${fieldName}" must be a scalar value (string, number, or boolean).`
        );
    }

    return value;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeKeyString(value) {
    return value
        .replaceAll(MULTI_KEY_ESCAPE, MULTI_KEY_ESCAPE + MULTI_KEY_ESCAPE)
        .replaceAll(
            MULTI_KEY_SEPARATOR,
            MULTI_KEY_ESCAPE + MULTI_KEY_SEPARATOR
        );
}

/**
 * @param {string[]} keyFields
 * @param {unknown[]} keyTuple
 * @returns {string}
 */
function makeCompositeKey(keyFields, keyTuple) {
    return keyTuple
        .map((value, i) => {
            const scalar = validateKeyComponent(value, keyFields, i);
            if (typeof scalar === "string") {
                return "s:" + escapeKeyString(scalar);
            } else if (typeof scalar === "number") {
                return "n:" + String(scalar);
            } else {
                return scalar ? "b:1" : "b:0";
            }
        })
        .join(MULTI_KEY_SEPARATOR);
}

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

    /** @type {Map<import("../spec/channel.js").Scalar | string, Datum> | null} */
    #keyIndex = null;

    /** @type {string[] | null} */
    #keyIndexFields = null;

    /** @type {boolean} */
    #keyIndexUsesTuple = false;
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
        this.#invalidateKeyIndex();

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
        this.#invalidateKeyIndex();

        if (isFacetBatch(flowBatch)) {
            this.#buffer = [];
            this.facetBatches.set(asArray(flowBatch.facetId), this.#buffer);
        }
    }

    complete() {
        // Free some memory
        this.#buffer = [];

        if (this.params.groupby?.length) {
            if (this.facetBatches.size > 1) {
                throw new Error("TODO: Support faceted data!");
            }

            const data = this.facetBatches.get(undefined);

            const accessors = this.params.groupby.map((fieldName) =>
                field(fieldName)
            );
            const groups =
                accessors.length > 1
                    ? // There's something strange in d3-array's typings
                      /** @type {Map<any, any>} */ /** @type {any} */ (
                          group(data, ...accessors)
                      )
                    : // D3's group is SLOW!
                      groupBy(data, accessors[0]);

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

        this.#buildUniqueIdIndex();
        this.#propagateToChildren();

        super.complete();

        this.#invalidateDomains();

        for (const observer of this.observers) {
            observer(this);
        }
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
     * @param {string[]} keyFields
     */
    #buildKeyIndex(keyFields) {
        /** @type {Array<(datum: Datum) => import("../spec/channel.js").Scalar>} */
        const accessors = keyFields.map((fieldName) => field(fieldName));

        /** @type {Map<import("../spec/channel.js").Scalar | string, Datum>} */
        const index = new Map();

        const useTuple = keyFields.length !== 1;

        for (const data of this.facetBatches.values()) {
            for (let i = 0, n = data.length; i < n; i++) {
                const datum = data[i];
                const keyTuple = accessors.map((accessor) => accessor(datum));
                const key = useTuple
                    ? makeCompositeKey(keyFields, keyTuple)
                    : validateKeyComponent(keyTuple[0], keyFields, 0);

                if (index.has(key)) {
                    const duplicateValue = useTuple ? keyTuple : key;
                    throw new Error(
                        `Duplicate key detected for fields [${keyFields.join(
                            ", "
                        )}]: ${JSON.stringify(duplicateValue)}`
                    );
                }

                index.set(key, datum);
            }
        }

        this.#keyIndex = index;
        this.#keyIndexFields = [...keyFields];
        this.#keyIndexUsesTuple = useTuple;
    }

    /**
     * @param {string[]} keyFields
     * @returns {Map<import("../spec/channel.js").Scalar | string, Datum>}
     */
    #getKeyIndex(keyFields) {
        if (!this.#keyIndex || !this.#matchesKeyFields(keyFields)) {
            this.#buildKeyIndex(keyFields);
        }

        return this.#keyIndex;
    }

    /**
     * @param {string[]} keyFields
     */
    #matchesKeyFields(keyFields) {
        if (!this.#keyIndexFields) {
            return false;
        }

        if (this.#keyIndexFields.length !== keyFields.length) {
            return false;
        }

        for (let i = 0; i < keyFields.length; i++) {
            if (this.#keyIndexFields[i] !== keyFields[i]) {
                return false;
            }
        }

        return true;
    }

    #invalidateKeyIndex() {
        this.#keyIndex = null;
        this.#keyIndexFields = null;
        this.#keyIndexUsesTuple = false;
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

        if (!keyFields || keyFields.length === 0) {
            return;
        }

        if (keyFields.length !== keyTuple.length) {
            throw new Error(
                `Key tuple length ${keyTuple.length} does not match fields [${keyFields.join(
                    ", "
                )}]`
            );
        }

        const index = this.#getKeyIndex(keyFields);
        const key = this.#keyIndexUsesTuple
            ? makeCompositeKey(keyFields, keyTuple)
            : validateKeyComponent(keyTuple[0], keyFields, 0);
        return index.get(key);
    }
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
 * Like D3's group but without InternMap, which is slow.
 * TODO: Implement multi-level grouping
 *
 * @param {Datum[]} data
 * @param {(data: Datum) => import("../spec/channel.js").Scalar} accessor
 */
function groupBy(data, accessor) {
    const groups = new Map();
    for (let i = 0, n = data.length; i < n; i++) {
        const datum = data[i];
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
                    `return a[${fieldName}] ${order === "ascending" ? "-" : "+"} b[${fieldName}];`
                )
            );
        }

        return compare(sort.field, sort.order);
    }
}
