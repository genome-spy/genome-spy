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
 * @param {boolean | "locus"} [grid] Validate grid coordinates and locus endpoints.
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
    if (grid === "locus") {
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
 * @param {string} x
 * @param {string | undefined} y Vertical grid dimension for a two-dimensional tile.
 * @param {string} field
 * @param {{direct: boolean, grid: boolean | "locus"}} options
 */
export function readRasterTile(datum, x, y, field, options) {
    const { direct, grid } = options;
    const tile = /** @type {RasterTile} */ (datum);
    const horizontal = readRasterDimension(datum, x, grid);
    const vertical =
        y === undefined ? undefined : readRasterDimension(datum, y, grid);
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
export function findRasterEdge({ origin, step, count }, bound, strict = false) {
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
 * @param {"start" | "end" | "intersects" | "encloses" | "endpoints"} mode
 * @returns {[number, number]} Half-open range of matching cell indices.
 */
export function getRasterCellRange(dimension, [lo, hi], mode) {
    if (!(lo < hi)) return [0, 0];
    const first = findRasterEdge(dimension, lo, mode === "intersects");
    const last = findRasterEdge(dimension, hi, mode === "encloses");
    const start = Math.min(
        dimension.count,
        Math.max(
            0,
            first -
                Number(
                    mode === "end" ||
                        mode === "intersects" ||
                        (mode === "endpoints" && first < last)
                )
        )
    );
    const end = last - Number(mode === "end" || mode === "encloses");
    return [start, Math.min(dimension.count, Math.max(start, end))];
}

/**
 * @param {number[]} domain Visible midpoints in data coordinates.
 * @param {number} width Logical track width.
 * @param {number} height Logical track height.
 */
export function getTriangleViewport(domain, width, height) {
    const lo = Math.min(...domain);
    const hi = Math.max(...domain);
    return { lo, hi, depth: ((hi - lo) * height) / width };
}

/**
 * Column-coordinate interval covered by the triangle within a row slab.
 * @param {ReturnType<typeof getTriangleViewport>} viewport
 * @param {number} rowStart
 * @param {number} rowEnd
 * @param {boolean} [contain]
 * @returns {[number, number]}
 */
export function getTriangleColumnDomain(
    { lo, hi, depth },
    rowStart,
    rowEnd,
    contain = false
) {
    return contain
        ? [
              Math.max(2 * lo - rowStart, rowEnd - 2 * depth),
              Math.min(2 * hi - rowEnd, rowStart),
          ]
        : [
              Math.max(2 * lo - rowEnd, rowStart - 2 * depth, lo - depth),
              Math.min(2 * hi - rowStart, rowEnd, hi),
          ];
}
