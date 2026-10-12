import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";

/**
 * Builds CPU membership from selected input rows, without projecting or scanning the population.
 * @param {import("../types/selectionTypes.js").RegionSelection} selection
 * @param {Iterable<import("../data/flowNode.js").Datum>} rows
 * @param {{ids: Uint32Array, indices: Uint32Array}} snapshot
 * @returns {Generator<void, import("../types/selectionTypes.js").RegionSelection, void>}
 */
export function* iterateRegionSelectionMembership(
    selection,
    rows,
    { ids, indices }
) {
    if (selection.status === "cleared" || ids.length !== indices.length)
        throw new Error("Invalid region membership snapshot.");
    if (!Array.isArray(rows))
        throw new Error("GPU lasso requires one complete input batch.");
    /** @type {Map<number, import("../data/flowNode.js").Datum>} */
    const data = new Map();
    for (let i = 0; i < ids.length; i++) {
        const datum = rows[indices[i]];
        if (
            !datum ||
            ids[i] === 0 ||
            datum[UNIQUE_ID_KEY] !== ids[i] ||
            data.has(ids[i])
        )
            throw new Error(
                "Region membership does not match the producer rows."
            );
        data.set(ids[i], datum);
        if (i % 256 === 255) yield;
    }
    return { type: "region", status: "ready", intent: selection.intent, data };
}
