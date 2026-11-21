/**
 * @typedef {object} RasterDimension
 * @prop {number} [origin] First cell edge in data coordinates for grid placement.
 * @prop {number} [step] Positive spacing between cell edges for grid placement.
 * @prop {number} count Number of cells on the dimension.
 */

/**
 * @typedef {object} RasterTile
 * @prop {Record<string, RasterDimension>} dimensions
 * @prop {Record<string, Float32Array | Uint32Array | string | (number | string | null)[]>} fields Cell values in row-major order.
 */

/**
 * @param {import("./flowNode.js").Datum} datum
 * @param {string} name
 * @param {boolean} [grid] Validate the coordinates used by a domain-aligned grid.
 */
export function readRasterDimension(datum, name, grid = false) {
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
        grid &&
        (!Number.isFinite(dimension.origin) ||
            !Number.isFinite(dimension.step) ||
            dimension.step <= 0)
    ) {
        throw new Error(
            `Raster dimension "${name}" needs a finite origin and a positive step.`
        );
    }
    return dimension;
}

/**
 * @param {import("./flowNode.js").Datum} datum
 * @param {string} x
 * @param {string | undefined} y Vertical grid dimension for a two-dimensional tile.
 * @param {string} field
 * @param {{direct: boolean, icon: boolean}} options
 */
export function readRasterTile(datum, x, y, field, options) {
    const { direct, icon } = options;
    const tile = /** @type {RasterTile} */ (datum);
    const horizontal = readRasterDimension(datum, x, !icon);
    const vertical =
        y === undefined ? undefined : readRasterDimension(datum, y, !icon);
    const values = tile.fields?.[field];
    const supported =
        Array.isArray(values) ||
        (direct
            ? values instanceof Uint32Array
            : values instanceof Float32Array || typeof values === "string");
    if (
        !supported ||
        values.length !== horizontal.count * (vertical?.count ?? 1)
    ) {
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
