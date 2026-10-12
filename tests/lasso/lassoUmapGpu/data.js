import { csvParse } from "d3-dsv";
import { UNIQUE_ID_KEY } from "@genome-spy/core/data/transforms/identifier.js";
import { restoreRegionScale } from "@genome-spy/core/selection/regionProjection.js";
import {
    createPendingRegionSelection,
    materializeRegionSelection,
} from "@genome-spy/core/selection/regionSelection.js";

/** @typedef {{x: number, y: number, __uniqueId: number}} Cell */
/** @typedef {"linear" | "log" | "sqrt"} ScaleType */

/** Parse the prepared file; translate both axes to positive values for log/sqrt views. @param {string} text */
export function parseUmap(text) {
    const labels = new Set();
    let minX = Infinity;
    let minY = Infinity;
    const rows = csvParse(text, (row, i) => {
        const x = Number(row.x);
        const y = Number(row.y);
        if (
            !row.cell_label?.trim() ||
            labels.has(row.cell_label) ||
            !row.x?.trim() ||
            !row.y?.trim() ||
            !Number.isFinite(x) ||
            !Number.isFinite(y)
        )
            throw new Error(
                "Expected uniquely labeled cells with finite x/y coordinates."
            );
        labels.add(row.cell_label);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        return { x, y, [UNIQUE_ID_KEY]: i + 1 };
    });
    if (!rows.length) throw new Error("UMAP file contains no cells.");
    for (const row of rows) {
        row.x = row.x - minX + 1;
        row.y = row.y - minY + 1;
    }
    return rows;
}

/** @param {Cell[]} rows @param {ScaleType} xType @param {ScaleType} yType */
export function projectUmap(rows, xType, yType) {
    let maxX = 1;
    let maxY = 1;
    for (const row of rows) {
        maxX = Math.max(maxX, row.x);
        maxY = Math.max(maxY, row.y);
    }
    if (maxX === 1 || maxY === 1)
        throw new Error("UMAP axes must have nonzero spans.");
    /** @type {{x: import("@genome-spy/core/types/selectionTypes.js").RegionScaleMapping, y: import("@genome-spy/core/types/selectionTypes.js").RegionScaleMapping}} */
    const scales = {
        x: { type: xType, domain: [1, maxX], range: [0, 1], clamp: false },
        y: { type: yType, domain: [1, maxY], range: [0, 1], clamp: false },
    };
    const sx = restoreRegionScale(scales.x);
    const sy = restoreRegionScale(scales.y);
    const x = new Float32Array(rows.length);
    const y = new Float32Array(rows.length);
    const ids = new Uint32Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
        x[i] = sx(rows[i].x);
        y[i] = sy(rows[i].y);
        ids[i] = rows[i][UNIQUE_ID_KEY];
    }
    return { data: { x, y, ids }, scales };
}

/** Explicit f64 CPU reference; do not hide or tolerance-filter differing IDs.
 * @param {Cell[]} rows
 * @param {ReturnType<typeof projectUmap>["scales"]} scales
 * @param {{polygon: ReadonlyArray<readonly [number,number]>, ids: Uint32Array}} selection
 */
export function compareSelection(rows, scales, selection) {
    const pending = createPendingRegionSelection({
        polygon: selection.polygon,
        scales,
        fields: { x: "x", y: "y" },
        producer: { scope: [], view: "umap" },
    });
    const reference = materializeRegionSelection(pending, rows);
    const gpu = new Set(selection.ids);
    let missing = 0;
    let extra = 0;
    for (const id of reference.data.keys()) if (!gpu.has(id)) missing++;
    for (const id of gpu) if (!reference.data.has(id)) extra++;
    return { cpu: reference.data.size, gpu: gpu.size, missing, extra };
}
