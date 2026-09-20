import UnitView from "./unitView.js";
import { isDataReady } from "../data/dataReadiness.js";
import { buildReadinessRequest } from "./dataReadiness.js";

/**
 * Detached metadata with authored and inherited encoding, not runtime mark adjustments.
 * @param {import("./view.js").default} view
 * @returns {import("../types/embedApi.js").ViewDescription}
 */
export function describeView(view) {
    const collector =
        view instanceof UnitView ? view.getCollector() : undefined;

    return {
        title: cloneDetached(view.getTitleText() ?? null),
        description: cloneDetached(view.spec.description ?? null),
        encoding: cloneDetached(view.getEncoding()),
        dataReady: Boolean(
            collector &&
            isDataReady(collector, buildReadinessRequest(view, ["x", "y"]))
        ),
    };
}

/**
 * Reads at most limit + 1 rows; the extra row establishes truncation.
 * This does not filter by viewport or claim complete source coverage.
 * @param {import("./view.js").default} view
 * @param {import("../types/embedApi.js").ViewDataReadOptions} options
 * @returns {import("../types/embedApi.js").ViewDataReadResult}
 */
export function readViewData(view, { limit }) {
    if (!Number.isInteger(limit) || limit < 0 || limit > 1000) {
        throw new Error("Data read limit must be an integer from 0 to 1000.");
    }
    if (!(view instanceof UnitView)) {
        throw new Error("Data reads require a unit view.");
    }

    const collector = view.getCollector();
    if (
        !collector ||
        !isDataReady(collector, buildReadinessRequest(view, ["x", "y"]))
    ) {
        throw new Error("View data is not ready.");
    }
    if (collector.facetBatches.size > 1) {
        throw new Error("Faceted data reads are not supported.");
    }

    const rows = [];
    let rowsExamined = 0;
    let truncated = false;

    for (const row of collector.getData()) {
        rowsExamined++;
        if (rows.length === limit) {
            truncated = true;
            break;
        }
        rows.push(cloneDetached(row));
    }

    return {
        rows,
        rowsExamined,
        truncated,
        scope: "loaded-transformed",
        ready: true,
    };
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
