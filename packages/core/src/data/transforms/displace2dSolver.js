const LONG_AXIS_RINGS = 2;
const SHORT_AXIS_RINGS = 8;
const CANDIDATE_OFFSETS = createCandidateOffsets();

/**
 * @typedef {object} Displacement2D
 * @prop {number[]} x Signed horizontal offsets.
 * @prop {number[]} y Signed vertical offsets.
 */

/**
 * Places axis-aligned rectangles without overlap using stable input order.
 *
 * Candidates form a small bounded strip around each original center.
 * Rectangles that exhaust the bounded search are placed in a non-overlapping
 * row to the right of all original and previously placed rectangles.
 *
 * @param {number[]} xPositions Original horizontal centers.
 * @param {number[]} yPositions Original vertical centers.
 * @param {number[]} widths Full collision widths.
 * @param {number[]} heights Full collision heights.
 * @param {[number, number]} [xExtent] Preferred horizontal outer bounds.
 * @param {[number, number]} [yExtent] Preferred vertical outer bounds.
 * @param {Displacement2D} [output] Reusable output arrays.
 * @returns {Displacement2D} The output arrays.
 */
export function solveDisplacement(
    xPositions,
    yPositions,
    widths,
    heights,
    xExtent,
    yExtent,
    output = { x: [], y: [] }
) {
    const count = xPositions.length;
    if (
        yPositions.length != count ||
        widths.length != count ||
        heights.length != count
    ) {
        throw new Error(
            "displace2d positions and dimensions must have the same number of values."
        );
    }
    validateExtent(xExtent, "xExtent");
    validateExtent(yExtent, "yExtent");

    const xDisplacements = output.x;
    const yDisplacements = output.y;
    xDisplacements.length = count;
    yDisplacements.length = count;

    let overflowCursor = xExtent?.[1] ?? -Infinity;
    let cellSize = 1;

    for (let i = 0; i < count; i++) {
        const x = xPositions[i];
        const y = yPositions[i];
        const width = widths[i];
        const height = heights[i];

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            throw new Error("displace2d positions must be finite numbers.");
        } else if (
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width < 0 ||
            height < 0
        ) {
            throw new Error(
                "displace2d dimensions must be finite non-negative numbers."
            );
        }

        overflowCursor = Math.max(overflowCursor, x + width / 2);
        // The largest dimension limits each rectangle to at most four cells,
        // keeping grid storage linear in the number of rectangles.
        cellSize = Math.max(cellSize, width, height);
    }

    /** @type {Map<number, Map<number, number[]>>} */
    const grid = new Map();

    /**
     * @param {number} index
     * @param {number} candidateX
     * @param {number} candidateY
     */
    const isAvailable = (index, candidateX, candidateY) => {
        const width = widths[index];
        const height = heights[index];

        if (
            !fitsExtent(candidateX, width, xExtent) ||
            !fitsExtent(candidateY, height, yExtent)
        ) {
            return false;
        }

        if (width == 0 || height == 0) {
            return true;
        }

        const minCellX = Math.floor((candidateX - width / 2) / cellSize);
        const maxCellX = Math.floor((candidateX + width / 2) / cellSize);
        const minCellY = Math.floor((candidateY - height / 2) / cellSize);
        const maxCellY = Math.floor((candidateY + height / 2) / cellSize);

        for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
            const column = grid.get(cellX);
            if (!column) {
                continue;
            }

            for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
                const occupants = column.get(cellY);
                if (!occupants) {
                    continue;
                }

                for (const j of occupants) {
                    const otherX = xPositions[j] + xDisplacements[j];
                    const otherY = yPositions[j] + yDisplacements[j];
                    if (
                        Math.abs(candidateX - otherX) * 2 < width + widths[j] &&
                        Math.abs(candidateY - otherY) * 2 < height + heights[j]
                    ) {
                        return false;
                    }
                }
            }
        }

        return true;
    };

    for (let i = 0; i < count; i++) {
        const x = xPositions[i];
        const y = yPositions[i];
        const width = widths[i];
        const height = heights[i];
        const preferredX = clampToExtent(x, width, xExtent);
        const preferredY = clampToExtent(y, height, yExtent);

        let placed = false;
        if (isAvailable(i, x, y)) {
            xDisplacements[i] = 0;
            yDisplacements[i] = 0;
            placed = true;
        } else if (
            (preferredX != x || preferredY != y) &&
            isAvailable(i, preferredX, preferredY)
        ) {
            xDisplacements[i] = preferredX - x;
            yDisplacements[i] = preferredY - y;
            placed = true;
        }

        for (const [dx, dy] of CANDIDATE_OFFSETS) {
            if (placed) {
                break;
            }

            const candidateX =
                preferredX + (width >= height ? dx * width : dy * width);
            const candidateY =
                preferredY + (width >= height ? dy * height : dx * height);
            if (isAvailable(i, candidateX, candidateY)) {
                xDisplacements[i] = candidateX - x;
                yDisplacements[i] = candidateY - y;
                placed = true;
            }
        }

        if (!placed) {
            const overflowX = overflowCursor + width / 2;
            const overflowY = clampToExtent(y, height, yExtent);
            xDisplacements[i] = overflowX - x;
            yDisplacements[i] = overflowY - y;
        }

        overflowCursor = Math.max(
            overflowCursor,
            x + xDisplacements[i] + width / 2
        );

        if (width > 0 && height > 0) {
            const placedX = x + xDisplacements[i];
            const placedY = y + yDisplacements[i];
            const minCellX = Math.floor((placedX - width / 2) / cellSize);
            const maxCellX = Math.floor((placedX + width / 2) / cellSize);
            const minCellY = Math.floor((placedY - height / 2) / cellSize);
            const maxCellY = Math.floor((placedY + height / 2) / cellSize);

            for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
                let column = grid.get(cellX);
                if (!column) {
                    column = new Map();
                    grid.set(cellX, column);
                }

                for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
                    let occupants = column.get(cellY);
                    if (!occupants) {
                        occupants = [];
                        column.set(cellY, occupants);
                    }
                    occupants.push(i);
                }
            }
        }
    }

    return output;
}

/**
 * Generates a bounded strip along the cheaper displacement axis.
 *
 * @returns {[number, number][]}
 */
function createCandidateOffsets() {
    /** @type {[number, number][]} */
    const offsets = [];

    for (let ring = 1; ring <= SHORT_AXIS_RINGS; ring++) {
        offsets.push([0, -ring], [0, ring]);
    }

    for (let column = 1; column <= LONG_AXIS_RINGS; column++) {
        offsets.push([column, 0], [-column, 0]);
        for (let ring = 1; ring <= SHORT_AXIS_RINGS; ring++) {
            offsets.push(
                [column, -ring],
                [column, ring],
                [-column, -ring],
                [-column, ring]
            );
        }
    }

    return offsets;
}

/**
 * @param {number} center
 * @param {number} size
 * @param {[number, number] | undefined} extent
 */
function fitsExtent(center, size, extent) {
    return (
        !extent ||
        (center - size / 2 >= extent[0] && center + size / 2 <= extent[1])
    );
}

/**
 * @param {number} center
 * @param {number} size
 * @param {[number, number] | undefined} extent
 */
function clampToExtent(center, size, extent) {
    if (!extent || size > extent[1] - extent[0]) {
        return center;
    }

    return Math.max(
        extent[0] + size / 2,
        Math.min(extent[1] - size / 2, center)
    );
}

/**
 * @param {[number, number] | undefined} extent
 * @param {string} name
 */
function validateExtent(extent, name) {
    if (
        extent &&
        (!Number.isFinite(extent[0]) ||
            !Number.isFinite(extent[1]) ||
            extent[0] > extent[1])
    ) {
        throw new Error(
            `displace2d ${name} must contain finite ascending bounds.`
        );
    }
}
