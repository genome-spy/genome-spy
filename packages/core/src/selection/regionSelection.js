import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import { field } from "../utils/field.js";
import { getRegionProjection, restoreRegionScale } from "./regionProjection.js";
import { createPolygonPredicate } from "./polygon.js";

/** @typedef {import("../types/selectionTypes.js").RegionSelection} RegionSelection */
/** @typedef {import("../types/selectionTypes.js").RegionSelectionIntent} RegionSelectionIntent */

/** @returns {RegionSelection} */
export function createRegionSelection() {
    return { type: "region", status: "cleared", intent: null, data: new Map() };
}

/**
 * Captures the geometric query without retaining membership from an older query.
 * A pending polygon is active even though it contributes no selected IDs.
 *
 * @param {RegionSelectionIntent} intent
 * @returns {RegionSelection}
 */
export function createPendingRegionSelection(intent) {
    createPolygonPredicate(intent.polygon);
    if (!intent.fields.x || !intent.fields.y || !intent.producer.view) {
        throw new Error(
            "A region selection requires x/y fields and a producer view."
        );
    }

    restoreRegionScale(intent.scales.x);
    restoreRegionScale(intent.scales.y);

    return {
        type: "region",
        status: "pending",
        intent: {
            polygon: intent.polygon.map(([x, y]) => [x, y]),
            fields: { ...intent.fields },
            scales: structuredClone(intent.scales),
            producer: {
                scope: Array.from(intent.producer.scope),
                view: intent.producer.view,
            },
        },
        data: new Map(),
    };
}

/**
 * Materializes a captured query against complete producer rows. The result uses
 * the producer's IDs so consumers with another projection can reuse membership.
 * This synchronous reference does not publish intermediate state or mutate the
 * pending selection. Gesture scheduling and stale-work cancellation belong to
 * the controller that invokes it.
 *
 * @param {RegionSelection} selection
 * @param {Iterable<import("../data/flowNode.js").Datum>} rows
 * @returns {RegionSelection}
 */
export function materializeRegionSelection(selection, rows) {
    const scan = iterateRegionSelection(selection, rows);
    let result = scan.next();
    while (!result.done) result = scan.next();
    return result.value;
}

/**
 * Shares the exact scan with callers that yield between bounded row batches.
 * No partial membership is published; closing the iterator discards its cache.
 * @param {RegionSelection} selection
 * @param {Iterable<import("../data/flowNode.js").Datum>} rows
 * @returns {Generator<void, RegionSelection, void>}
 */
function* iterateRegionSelection(selection, rows) {
    if (selection.status === "cleared") {
        throw new Error("Cannot materialize a cleared region selection.");
    }

    const intent = selection.intent;
    const contains = createPolygonPredicate(intent.polygon);
    const xScale = restoreRegionScale(intent.scales.x);
    const yScale = restoreRegionScale(intent.scales.y);
    const getX = field(intent.fields.x);
    const getY = field(intent.fields.y);
    /** @type {Map<number, import("../data/flowNode.js").Datum>} */
    const data = new Map();

    let batch = 0;
    for (const datum of rows) {
        const x = getX(datum);
        const y = getY(datum);
        if (
            Number.isFinite(x) &&
            Number.isFinite(y) &&
            contains(xScale(x), yScale(y))
        ) {
            const id = datum[UNIQUE_ID_KEY];
            if (!Number.isInteger(id) || id <= 0 || id > 0xffffffff) {
                throw new Error(
                    "Region membership requires positive u32 point IDs."
                );
            }
            if (data.has(id)) {
                throw new Error("Region membership requires unique point IDs.");
            }
            data.set(id, datum);
        }
        if (++batch === 256) {
            batch = 0;
            yield;
        }
    }

    return { type: "region", status: "ready", intent, data };
}

/**
 * Rebuilds membership in the original projection using the producer's current rows.
 * @param {RegionSelection} selection
 * @param {import("../view/unitView.js").default} view
 * @returns {RegionSelection}
 */
export function materializeRegionSelectionForView(selection, view) {
    const scan = iterateRegionSelectionForView(selection, view);
    let result = scan.next();
    while (!result.done) result = scan.next();
    return result.value;
}

/**
 * @param {RegionSelection} selection
 * @param {import("../view/unitView.js").default} view
 * @returns {Generator<void, RegionSelection, void>}
 */
export function iterateRegionSelectionForView(selection, view) {
    if (selection.status === "cleared")
        throw new Error("Cannot materialize a cleared region selection.");
    const { fields, producer } = getRegionProjection(view);
    if (
        JSON.stringify(producer) !==
            JSON.stringify(selection.intent.producer) ||
        fields.x !== selection.intent.fields.x ||
        fields.y !== selection.intent.fields.y
    ) {
        throw new Error(
            "Region selection intent does not match its producer fields and scope."
        );
    }
    return iterateRegionSelection(selection, view.getCollector().getData());
}
