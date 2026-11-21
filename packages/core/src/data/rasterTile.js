/**
 * @typedef {object} RasterDimension
 * @prop {number} origin First cell edge in data coordinates.
 * @prop {number} step Positive spacing between cell edges.
 * @prop {number} count Number of cells on the dimension.
 */

/**
 * @typedef {object} RasterTile
 * @prop {Record<string, RasterDimension>} dimensions
 * @prop {Record<string, Float32Array | string | (number | string | null)[]>} fields Cell values in row-major order.
 */

/**
 * @param {import("./flowNode.js").Datum} datum
 * @param {string} x
 * @param {string | undefined} y Vertical grid dimension for a two-dimensional tile.
 * @param {string} field
 */
export function readRasterTile(datum, x, y, field) {
    const tile = /** @type {RasterTile} */ (datum);
    const horizontal = tile.dimensions?.[x];
    const vertical = y === undefined ? undefined : tile.dimensions?.[y];
    const values = tile.fields?.[field];
    for (const dimension of y === undefined
        ? [horizontal]
        : [horizontal, vertical]) {
        if (
            !dimension ||
            !Number.isFinite(dimension.origin) ||
            !Number.isFinite(dimension.step) ||
            dimension.step <= 0 ||
            !Number.isSafeInteger(dimension.count) ||
            dimension.count <= 0
        ) {
            throw new Error(
                "Raster dimensions need a finite origin, a positive step, and a positive integer count."
            );
        }
    }
    if (
        !(
            values instanceof Float32Array ||
            Array.isArray(values) ||
            typeof values === "string"
        ) ||
        values.length !== horizontal.count * (vertical?.count ?? 1)
    ) {
        throw new Error(
            `Raster field "${field}" must contain one value for each grid cell.`
        );
    }
    return { horizontal, vertical, values };
}

/** @param {number | string | null} value */
export function readNumericRasterCell(value) {
    if (typeof value === "number") return value;
    if (value == null) return NaN;
    throw new Error("Quantitative raster fields need numeric cells.");
}

/**
 * Restrict a grid dimension to the cells contributing to a viewport domain.
 * @param {RasterDimension} dimension
 * @param {import("./viewportDomain.js").ViewportConstraint} [constraint]
 * @returns {[number, number]} Half-open range of cell indices.
 */
export function getVisibleCellRange({ origin, step, count }, constraint) {
    if (!constraint) return [0, count];
    const [a, b] = constraint.domain;
    const start = (Math.min(a, b) - origin) / step;
    const end = (Math.max(a, b) - origin) / step;
    if (start === end) return [0, 0];
    const contain = constraint.mode === "contain";
    return [
        Math.max(0, contain ? Math.ceil(start) : Math.floor(start)),
        Math.min(count, contain ? Math.floor(end) : Math.ceil(end)),
    ];
}
