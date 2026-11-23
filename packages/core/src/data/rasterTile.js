/**
 * @typedef {object} RasterDimension
 * @prop {number} origin First cell edge in data coordinates.
 * @prop {number} step Positive spacing between cell edges.
 * @prop {number} count Number of cells on the dimension.
 */

/**
 * @typedef {object} RasterTile
 * @prop {Record<string, RasterDimension>} dimensions
 * @prop {Record<string, Float32Array | Uint32Array | string | (number | string | null)[]>} fields Cell values in row-major order.
 */

// A strip occupies one cell along its categorical axis.
const bandDimension = Object.freeze({ origin: 0, step: 1, count: 1 });

/**
 * @param {import("./flowNode.js").Datum} datum
 * @param {string | undefined} name Dimension name. Omit for a categorical band.
 * @param {boolean} [locus] Require nonnegative whole-base endpoints.
 */
export function readRasterDimension(datum, name, locus = false) {
    if (name === undefined) return bandDimension;
    const dimension = /** @type {RasterTile} */ (datum).dimensions?.[name];
    if (
        !dimension ||
        !Number.isSafeInteger(dimension.count) ||
        dimension.count <= 0
    ) {
        throw new Error(
            `Raster dimension "${name}" needs a positive integer count.`
        );
    }
    if (
        !Number.isFinite(dimension.origin) ||
        !Number.isFinite(dimension.step) ||
        dimension.step <= 0
    ) {
        throw new Error(
            `Raster dimension "${name}" needs a finite origin and a positive step.`
        );
    }
    if (locus) {
        const { origin, step, count } = dimension;
        const end = origin + step * count;
        // Locus GPU buffers store endpoints as an unsigned 32-bit chunk and a 12-bit remainder.
        if (
            !Number.isInteger(origin) ||
            origin < 0 ||
            !Number.isInteger(end) ||
            end >= 2 ** 44
        ) {
            throw new Error(
                `Raster dimension "${name}" needs nonnegative whole-base endpoints below 2^44.`
            );
        }
    }
    return dimension;
}

/**
 * @param {import("./flowNode.js").Datum} datum
 * @param {string | undefined} x
 * @param {string | undefined} y
 * @param {string} field
 * @param {{direct: boolean, locus: boolean}} options
 */
export function readRasterTile(datum, x, y, field, options) {
    const { direct, locus } = options;
    const tile = /** @type {RasterTile} */ (datum);
    const horizontal = readRasterDimension(datum, x, locus);
    const vertical = readRasterDimension(datum, y, locus);
    const values = tile.fields?.[field];
    const supported =
        Array.isArray(values) ||
        (direct
            ? values instanceof Uint32Array
            : values instanceof Float32Array || typeof values === "string");
    if (!supported || values.length !== horizontal.count * vertical.count) {
        throw new Error(
            `Raster field "${field}" must contain one value for each grid cell.`
        );
    }
    return {
        horizontal,
        vertical,
        values:
            direct && Array.isArray(values)
                ? Uint32Array.from(values, readPackedRasterCell)
                : values,
    };
}

/** @param {number | string | null} value */
function readPackedRasterCell(value) {
    if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 0xffffffff
    ) {
        throw new Error(
            "Direct raster colors need unsigned 32-bit RGBA values."
        );
    }
    return value;
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
 * @param {Pick<import("./viewportDomain.js").ViewportConstraint, "domain" | "mode">} [constraint]
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

/**
 * Find the first cell edge at or above a bound. Strict search skips equal
 * edges. Compare the original edges to preserve exact fractional boundaries.
 * @param {RasterDimension} dimension
 * @param {number} bound
 * @param {boolean} [strict]
 */
function findRasterEdge({ origin, step, count }, bound, strict = false) {
    let lo = 0;
    let hi = count + 1;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const edge = origin + mid * step;
        if (edge < bound || (strict && edge === bound)) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

/**
 * @param {RasterDimension} dimension
 * @param {readonly number[]} bounds
 * @returns {[number, number]} Half-open range of cells overlapping the brush.
 */
export function getRasterCellRange(dimension, [lo, hi]) {
    if (!(lo < hi)) return [0, 0];
    const start = Math.max(0, findRasterEdge(dimension, lo, true) - 1);
    const end = findRasterEdge(dimension, hi);
    return [start, Math.min(dimension.count, Math.max(start, end))];
}
