import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import UnitView from "./unitView.js";
import { isDataReady } from "../data/dataReadiness.js";

/**
 * Copies currently loaded transformed rows without filtering by viewport.
 * The one lookahead row establishes truncation without cloning excess rows.
 * @param {import("./view.js").default} view
 * @param {import("../types/embedApi.js").ViewDataReadOptions} options
 * @returns {import("../types/embedApi.js").ViewDataReadResult}
 */
export function readViewData(view, options) {
    if (!options || !Number.isSafeInteger(options.limit) || options.limit < 0) {
        throw new Error("Data reads require a nonnegative safe integer limit.");
    }
    if (!(view instanceof UnitView)) {
        throw new Error("Data reads require a unit view.");
    }
    const collector = view.getCollector();
    if (!collector || !isDataReady(collector)) {
        throw new Error("View data is not ready.");
    }

    const rows = [];
    for (const row of collector.getData()) {
        if (rows.length === options.limit) return { rows, truncated: true };
        const copy = cloneDetached(row);
        delete copy[UNIQUE_ID_KEY];
        rows.push(copy);
    }
    return { rows, truncated: false };
}

/**
 * Structured cloning retains shared memory. Inspect the clone so source getters
 * run only once, and reject shared buffers before exposing a result.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneDetached(value) {
    const clone = structuredClone(value);
    /** @type {unknown[]} */
    const pending = [clone];
    const visited = new Set();

    while (pending.length) {
        const item = pending.pop();
        if (item === null || typeof item !== "object" || visited.has(item)) {
            continue;
        }
        visited.add(item);

        if (
            typeof SharedArrayBuffer !== "undefined" &&
            item instanceof SharedArrayBuffer
        ) {
            throw new TypeError(
                "Shared memory is not supported in view API results."
            );
        }

        if (ArrayBuffer.isView(item) || item instanceof WebAssembly.Memory) {
            pending.push(item.buffer);
        } else if (item instanceof Map) {
            for (const [key, entry] of item) {
                pending.push(key, entry);
            }
        } else if (item instanceof Set) {
            for (const entry of item) {
                pending.push(entry);
            }
        } else if (item instanceof Error) {
            pending.push(item.cause);
            if (item instanceof AggregateError) {
                pending.push(item.errors);
            }
        } else {
            for (const entry of Object.values(item)) {
                pending.push(entry);
            }
        }
    }

    return clone;
}
