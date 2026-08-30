const LONG_AXIS_RINGS = 2;
const SHORT_AXIS_RINGS = 8;
const CANDIDATE_OFFSETS = createCandidateOffsets();

/**
 * @typedef {object} Displacement2D
 * @prop {number[]} x Signed horizontal offsets.
 * @prop {number[]} y Signed vertical offsets.
 */

/**
 * @typedef {object} Displacement2DObstacles
 * @prop {number[]} x Horizontal centers.
 * @prop {number[]} y Vertical centers.
 * @prop {number[]} width Full collision widths.
 * @prop {number[]} height Full collision heights.
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
 * @param {Displacement2DObstacles} [obstacles] Preplaced collision rectangles.
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
    obstacles,
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

        if (width > 0 && height > 0) {
            overflowCursor = Math.max(overflowCursor, x + width / 2);
            // The largest dimension limits each rectangle to at most four cells,
            // keeping grid storage linear in the number of rectangles.
            cellSize = Math.max(cellSize, width, height);
        }
    }

    const obstacleData = obstacles ?? { x: [], y: [], width: [], height: [] };
    const obstacleCount = obstacleData.x.length;
    if (
        obstacleData.y.length != obstacleCount ||
        obstacleData.width.length != obstacleCount ||
        obstacleData.height.length != obstacleCount
    ) {
        throw new Error(
            "displace2d obstacle positions and dimensions must have the same number of values."
        );
    }

    for (let i = 0; i < obstacleCount; i++) {
        const x = obstacleData.x[i];
        const y = obstacleData.y[i];
        const width = obstacleData.width[i];
        const height = obstacleData.height[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            throw new Error(
                "displace2d obstacle positions must be finite numbers."
            );
        } else if (
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width < 0 ||
            height < 0
        ) {
            throw new Error(
                "displace2d obstacle dimensions must be finite non-negative numbers."
            );
        }

        if (width > 0 && height > 0) {
            overflowCursor = Math.max(overflowCursor, x + width / 2);
            cellSize = Math.max(cellSize, width, height);
        }
    }

    /** @type {Map<number, Map<number, number[]>>} */
    const grid = new Map();

    /**
     * @param {number} index
     * @param {number} centerX
     * @param {number} centerY
     * @param {number} width
     * @param {number} height
     */
    const addToGrid = (index, centerX, centerY, width, height) => {
        if (width == 0 || height == 0) {
            return;
        }

        const minCellX = Math.floor((centerX - width / 2) / cellSize);
        const maxCellX = Math.floor((centerX + width / 2) / cellSize);
        const minCellY = Math.floor((centerY - height / 2) / cellSize);
        const maxCellY = Math.floor((centerY + height / 2) / cellSize);

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
                occupants.push(index);
            }
        }
    };

    for (let i = 0; i < obstacleCount; i++) {
        addToGrid(
            count + i,
            obstacleData.x[i],
            obstacleData.y[i],
            obstacleData.width[i],
            obstacleData.height[i]
        );
    }

    /**
     * @param {number} index
     * @param {number} candidateX
     * @param {number} candidateY
     */
    const isAvailable = (index, candidateX, candidateY) => {
        const width = widths[index];
        const height = heights[index];

        if (
            !hasFiniteBounds(candidateX, width) ||
            !hasFiniteBounds(candidateY, height) ||
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

                for (const occupant of occupants) {
                    const isObstacle = occupant >= count;
                    const j = isObstacle ? occupant - count : occupant;
                    const otherX = isObstacle
                        ? obstacleData.x[j]
                        : xPositions[j] + xDisplacements[j];
                    const otherY = isObstacle
                        ? obstacleData.y[j]
                        : yPositions[j] + yDisplacements[j];
                    const otherWidth = isObstacle
                        ? obstacleData.width[j]
                        : widths[j];
                    const otherHeight = isObstacle
                        ? obstacleData.height[j]
                        : heights[j];
                    if (
                        Math.abs(candidateX - otherX) <
                            width / 2 + otherWidth / 2 &&
                        Math.abs(candidateY - otherY) <
                            height / 2 + otherHeight / 2
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
        if (width == 0 || height == 0) {
            xDisplacements[i] = 0;
            yDisplacements[i] = 0;
            continue;
        }

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

        const placedX = x + xDisplacements[i];
        const placedY = y + yDisplacements[i];
        if (
            !hasFiniteBounds(placedX, width) ||
            !hasFiniteBounds(placedY, height)
        ) {
            throw new Error(
                "displace2d placement exceeded the finite numeric range."
            );
        }

        if (width > 0 && height > 0) {
            overflowCursor = Math.max(overflowCursor, placedX + width / 2);
        }

        addToGrid(i, placedX, placedY, width, height);
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
 */
function hasFiniteBounds(center, size) {
    return (
        Number.isFinite(center - size / 2) && Number.isFinite(center + size / 2)
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
