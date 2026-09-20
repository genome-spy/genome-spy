const ANCHOR_PROJECTION = 0.02;
const COLLISION_PADDING = 2;
const COLLISION_PROJECTION = 0.9;
const MAX_STEP = 1.5;
const COMPACTION_SAMPLES = 32;
const REPAIR_INTERVAL = 32;
const REPAIR_CANDIDATES = 128;
const MAX_REPAIRS_PER_SWEEP = 8;
const MIN_RADIAL_IMPROVEMENT = 1;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MOVEMENT_EPSILON = 0.01;
const OVERLAP_EPSILON = 0.05;
const SETTLED_ITERATIONS = 4;
const MAX_ITERATIONS = 800;

/**
 * Mutable state for one progressively displaced rectangle.
 *
 * @typedef {object} ConstraintItem
 * @prop {import("../flowNode.js").Datum} datum
 * @prop {number} anchorX
 * @prop {number} anchorY
 * @prop {number} x
 * @prop {number} y
 * @prop {number} width
 * @prop {number} height
 * @prop {number} anchorWidth
 * @prop {number} anchorHeight
 * @prop {number} priority
 */

/**
 * Progressively finds non-overlapping placements for anchored rectangles.
 *
 * The objective is inspired by ggrepel: keep label boxes apart from each other
 * and from data points while pulling them toward their anchors. No ggrepel code
 * or force simulation is used here.
 * https://github.com/slowkow/ggrepel
 *
 * A sweep first applies plot bounds and collision-aware anchor attraction. It
 * then visits every label pair and anchor obstacle, projecting overlaps apart
 * along their shallowest axis. Corrections are divided according to priority
 * and capped so intermediate states remain usable for progressive display.
 *
 * This inner loop borrows sequential constraint projection and inverse-mass
 * mobility from Position Based Dynamics. It is not a physical simulation or a
 * full PBD implementation: there is no time integration, velocity, or momentum.
 * https://doi.org/10.2312/PE/vriphys/vriphys06/071-080
 *
 * Periodic deterministic radial searches escape local tangles and later try
 * to replace needlessly distant placements with closer ones. Their Vogel-style
 * golden-angle spiral samples directions without favoring the coordinate axes.
 * https://doi.org/10.1016/0025-5564(79)90080-4
 *
 * The surrounding transform runs bounded batches of sweeps and publishes them
 * incrementally, following the interaction model of browser force layouts even
 * though this numerical method is not force-directed.
 * https://d3js.org/d3-force/simulation
 *
 * Pair scans are deliberately quadratic: useful label counts are modest, and
 * dense layouts leave little for a spatial broad phase to prune. The solver
 * favors stable progressive motion over a global optimum; a method such as VPSC
 * could improve placement quality but would be a substantially different design.
 */
export class Displace2DConstraintSolver {
    /** @type {ConstraintItem[]} */
    items;

    /** @type {[number, number] | undefined} */
    xExtent;

    /** @type {[number, number] | undefined} */
    yExtent;

    #startX;
    #startY;
    #mobility;
    #iterations = 0;
    #settledIterations = 0;
    #active = true;

    /**
     * @param {ConstraintItem[]} items
     * @param {[number, number]} [xExtent]
     * @param {[number, number]} [yExtent]
     */
    constructor(items, xExtent, yExtent) {
        const invalidItem = items.some(
            ({ anchorX, anchorY, width, height, anchorWidth, anchorHeight }) =>
                ![
                    anchorX,
                    anchorY,
                    width,
                    height,
                    anchorWidth,
                    anchorHeight,
                ].every(Number.isFinite) ||
                Math.min(width, height, anchorWidth, anchorHeight) < 0
        );
        const invalidExtent = [xExtent, yExtent].some(
            (extent) =>
                extent &&
                (!Number.isFinite(extent[0]) ||
                    !Number.isFinite(extent[1]) ||
                    extent[0] > extent[1])
        );
        if (invalidItem || invalidExtent) {
            throw new Error("displace2d received invalid geometry.");
        }

        this.items = items;
        this.xExtent = xExtent;
        this.yExtent = yExtent;
        this.#startX = new Float64Array(items.length);
        this.#startY = new Float64Array(items.length);
        this.#mobility = Float64Array.from(items, (item) =>
            mobility(item.priority, items.length)
        );
    }

    get active() {
        return this.#active;
    }

    /**
     * Moves retained labels to the nearest sampled collision-free position on
     * the segment from their anchor to their current position.
     *
     * Unlike projection sweeps, this operation is intentionally allowed to
     * jump. It releases layouts that became needlessly stretched after their
     * anchors or collision neighborhood changed.
     *
     * @returns {boolean} Whether any item moved.
     */
    compactTowardAnchors() {
        let changed = false;
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            if (item.width == 0 || item.height == 0) {
                changed ||= item.x != item.anchorX || item.y != item.anchorY;
                item.x = item.anchorX;
                item.y = item.anchorY;
                continue;
            }

            const dx = item.x - item.anchorX;
            const dy = item.y - item.anchorY;
            for (let sample = 0; sample < COMPACTION_SAMPLES; sample++) {
                const fraction = sample / COMPACTION_SAMPLES;
                const x = item.anchorX + dx * fraction;
                const y = item.anchorY + dy * fraction;
                if (this.#isAvailable(i, x, y)) {
                    changed ||= x != item.x || y != item.y;
                    item.x = x;
                    item.y = y;
                    break;
                }
            }
        }
        return changed;
    }

    /**
     * Advances the solver by one fixed projection sweep.
     *
     * @returns {boolean} Whether any item moved.
     */
    step() {
        if (!this.#active) {
            return false;
        }

        const items = this.items;
        // Snapshot the sweep origin because every projection is limited to a
        // common movement envelope, regardless of how many constraints hit it.
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            this.#startX[i] = item.x;
            this.#startY[i] = item.y;

            if (item.width == 0 || item.height == 0) {
                item.x = item.anchorX;
                item.y = item.anchorY;
            }
        }

        // Bounds and attraction are soft preparation; the following pairwise
        // projections enforce label and anchor separation.
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.width > 0 && item.height > 0) {
                this.#projectBounds(i);
                this.#projectTowardAnchor(i);
            }
        }

        for (let i = 0; i < items.length; i++) {
            const first = items[i];
            if (first.width == 0 || first.height == 0) {
                continue;
            }

            for (let j = i + 1; j < items.length; j++) {
                const second = items[j];
                if (second.width == 0 || second.height == 0) {
                    continue;
                }

                const correction = getOverlapCorrection(
                    first.x,
                    first.y,
                    first.width + COLLISION_PADDING,
                    first.height + COLLISION_PADDING,
                    second.x,
                    second.y,
                    second.width + COLLISION_PADDING,
                    second.height + COLLISION_PADDING,
                    i,
                    j
                );
                if (!correction) {
                    continue;
                }

                const firstMobility = this.#mobility[i];
                const secondMobility = this.#mobility[j];
                const mobilitySum = firstMobility + secondMobility;
                this.#move(
                    i,
                    (correction.x * firstMobility * COLLISION_PROJECTION) /
                        mobilitySum,
                    (correction.y * firstMobility * COLLISION_PROJECTION) /
                        mobilitySum
                );
                this.#move(
                    j,
                    (-correction.x * secondMobility * COLLISION_PROJECTION) /
                        mobilitySum,
                    (-correction.y * secondMobility * COLLISION_PROJECTION) /
                        mobilitySum
                );
            }

            for (let j = 0; j < items.length; j++) {
                const obstacle = items[j];
                if (obstacle.anchorWidth == 0 || obstacle.anchorHeight == 0) {
                    continue;
                }

                const correction = getOverlapCorrection(
                    first.x,
                    first.y,
                    first.width + COLLISION_PADDING,
                    first.height + COLLISION_PADDING,
                    obstacle.anchorX,
                    obstacle.anchorY,
                    obstacle.anchorWidth + COLLISION_PADDING,
                    obstacle.anchorHeight + COLLISION_PADDING,
                    i,
                    items.length + j
                );
                if (correction) {
                    this.#move(
                        i,
                        correction.x * COLLISION_PROJECTION,
                        correction.y * COLLISION_PROJECTION
                    );
                }
            }

            this.#projectBounds(i);
        }

        let maxMovement = 0;
        for (let i = 0; i < items.length; i++) {
            this.#projectBounds(i);
            maxMovement = Math.max(
                maxMovement,
                Math.abs(items[i].x - this.#startX[i]),
                Math.abs(items[i].y - this.#startY[i])
            );
        }

        // Full overlap checks are only needed near convergence or when a
        // repair is due. During an ordinary moving sweep, assuming overlap is
        // conservative and avoids another quadratic pass.
        const repairDue = (this.#iterations + 1) % REPAIR_INTERVAL == 0;
        let overlapping =
            maxMovement > MOVEMENT_EPSILON && !repairDue
                ? true
                : hasSignificantOverlap(items);
        if (overlapping && repairDue && this.#repairOverlaps()) {
            overlapping = hasSignificantOverlap(items);
            for (let i = 0; i < items.length; i++) {
                maxMovement = Math.max(
                    maxMovement,
                    Math.abs(items[i].x - this.#startX[i]),
                    Math.abs(items[i].y - this.#startY[i])
                );
            }
        }
        if (
            !overlapping &&
            maxMovement <= MOVEMENT_EPSILON &&
            this.#improvePlacements()
        ) {
            overlapping = hasSignificantOverlap(items);
            for (let i = 0; i < items.length; i++) {
                maxMovement = Math.max(
                    maxMovement,
                    Math.abs(items[i].x - this.#startX[i]),
                    Math.abs(items[i].y - this.#startY[i])
                );
            }
        }
        this.#iterations++;
        if (!overlapping && maxMovement <= MOVEMENT_EPSILON) {
            this.#settledIterations++;
        } else {
            this.#settledIterations = 0;
        }
        if (
            this.#settledIterations >= SETTLED_ITERATIONS ||
            this.#iterations >= MAX_ITERATIONS
        ) {
            this.#active = false;
        }

        return maxMovement > 0;
    }

    /** Runs the bounded solver to completion for synchronous dataflows. */
    solve() {
        while (this.#active) {
            this.step();
        }
    }

    /** @param {number} index @param {number} dx @param {number} dy */
    #move(index, dx, dy) {
        const item = this.items[index];
        item.x = clamp(
            item.x + dx,
            this.#startX[index] - MAX_STEP,
            this.#startX[index] + MAX_STEP
        );
        item.y = clamp(
            item.y + dy,
            this.#startY[index] - MAX_STEP,
            this.#startY[index] + MAX_STEP
        );
    }

    /** @param {number} index */
    #projectBounds(index) {
        const item = this.items[index];
        if (this.xExtent && item.width <= this.xExtent[1] - this.xExtent[0]) {
            this.#move(
                index,
                clamp(
                    item.x,
                    this.xExtent[0] + item.width / 2,
                    this.xExtent[1] - item.width / 2
                ) - item.x,
                0
            );
        }
        if (this.yExtent && item.height <= this.yExtent[1] - this.yExtent[0]) {
            this.#move(
                index,
                0,
                clamp(
                    item.y,
                    this.yExtent[0] + item.height / 2,
                    this.yExtent[1] - item.height / 2
                ) - item.y
            );
        }
    }

    /** @param {number} index */
    #projectTowardAnchor(index) {
        const item = this.items[index];
        const x = clamp(
            item.x + (item.anchorX - item.x) * ANCHOR_PROJECTION,
            this.#startX[index] - MAX_STEP,
            this.#startX[index] + MAX_STEP
        );
        const y = clamp(
            item.y + (item.anchorY - item.y) * ANCHOR_PROJECTION,
            this.#startY[index] - MAX_STEP,
            this.#startY[index] + MAX_STEP
        );
        if (x == item.x && y == item.y) {
            return;
        }
        if (this.#isAvailable(index, x, y)) {
            item.x = x;
            item.y = y;
        }
    }

    /** @param {number} index @param {number} x @param {number} y */
    #isAvailable(index, x, y) {
        const item = this.items[index];
        if (
            !fitsExtent(x, item.width, this.xExtent) ||
            !fitsExtent(y, item.height, this.yExtent)
        ) {
            return false;
        }

        for (let i = 0; i < this.items.length; i++) {
            const other = this.items[i];
            if (
                i != index &&
                rectanglesOverlap(
                    x,
                    y,
                    item.width,
                    item.height,
                    other.x,
                    other.y,
                    other.width,
                    other.height
                )
            ) {
                return false;
            }
            if (
                rectanglesOverlap(
                    x,
                    y,
                    item.width,
                    item.height,
                    other.anchorX,
                    other.anchorY,
                    other.anchorWidth,
                    other.anchorHeight
                )
            ) {
                return false;
            }
        }
        return true;
    }

    #repairOverlaps() {
        let repairs = 0;
        // Lower-priority (later) labels move first. Golden-angle samples cover
        // the neighborhood deterministically without favoring cardinal axes.
        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            if (
                item.width == 0 ||
                item.height == 0 ||
                this.#isAvailable(i, item.x, item.y)
            ) {
                continue;
            }

            const radialStep = Math.max(
                4,
                Math.sqrt(item.width * item.height) / 4
            );
            const phase =
                (pairHash(i, this.items.length) / 2 ** 32) * Math.PI * 2;
            for (
                let candidate = 0;
                candidate < REPAIR_CANDIDATES;
                candidate++
            ) {
                const expansion = 1 + candidate / (4 * (REPAIR_CANDIDATES - 1));
                const radius =
                    radialStep * Math.sqrt(candidate + 1) * expansion;
                const angle = phase + candidate * GOLDEN_ANGLE;
                const x = item.anchorX + Math.cos(angle) * radius;
                const y = item.anchorY + Math.sin(angle) * radius;
                if (this.#isAvailable(i, x, y)) {
                    item.x = x;
                    item.y = y;
                    repairs++;
                    break;
                }
            }
            if (repairs >= MAX_REPAIRS_PER_SWEEP) {
                break;
            }
        }
        return repairs > 0;
    }

    #improvePlacements() {
        let improvements = 0;
        // Once constraints are satisfied, accept only legal samples that are
        // meaningfully closer than the current local optimum.
        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            const currentDistance = Math.hypot(
                item.x - item.anchorX,
                item.y - item.anchorY
            );
            if (
                item.width == 0 ||
                item.height == 0 ||
                currentDistance <= MIN_RADIAL_IMPROVEMENT
            ) {
                continue;
            }

            const radialStep = Math.max(
                4,
                Math.min(item.width, item.height) / 3
            );
            const phase =
                (pairHash(i, this.items.length + 1) / 2 ** 32) * Math.PI * 2;
            for (
                let candidate = 0;
                candidate < REPAIR_CANDIDATES;
                candidate++
            ) {
                const radius = radialStep * Math.sqrt(candidate + 1);
                if (radius + MIN_RADIAL_IMPROVEMENT >= currentDistance) {
                    break;
                }

                const angle = phase + candidate * GOLDEN_ANGLE;
                const x = item.anchorX + Math.cos(angle) * radius;
                const y = item.anchorY + Math.sin(angle) * radius;
                if (this.#isAvailable(i, x, y)) {
                    item.x = x;
                    item.y = y;
                    improvements++;
                    break;
                }
            }
            if (improvements >= MAX_REPAIRS_PER_SWEEP) {
                break;
            }
        }
        return improvements > 0;
    }
}

/**
 * Returns the translation that moves the first rectangle out of the second.
 *
 * @param {number} x1
 * @param {number} y1
 * @param {number} width1
 * @param {number} height1
 * @param {number} x2
 * @param {number} y2
 * @param {number} width2
 * @param {number} height2
 * @param {number} firstIndex
 * @param {number} secondIndex
 * @returns {{ x: number, y: number } | undefined}
 */
function getOverlapCorrection(
    x1,
    y1,
    width1,
    height1,
    x2,
    y2,
    width2,
    height2,
    firstIndex,
    secondIndex
) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    const overlapX = (width1 + width2) / 2 - Math.abs(dx);
    const overlapY = (height1 + height2) / 2 - Math.abs(dy);
    if (!(overlapX > 0 && overlapY > 0)) {
        return undefined;
    }

    if (dx == 0 && dy == 0) {
        const horizontalShare =
            (height1 + height2) / (width1 + width2 + height1 + height2);
        if (pairHash(firstIndex, secondIndex) / 2 ** 32 < horizontalShare) {
            return {
                x: overlapX * collisionDirection(dx, firstIndex, secondIndex),
                y: 0,
            };
        }
        return {
            x: 0,
            y: overlapY * collisionDirection(dy, firstIndex, secondIndex),
        };
    }

    if (
        overlapX < overlapY ||
        (overlapX == overlapY && pairHash(firstIndex, secondIndex) % 2 == 0)
    ) {
        return {
            x: overlapX * collisionDirection(dx, firstIndex, secondIndex),
            y: 0,
        };
    }
    return {
        x: 0,
        y: overlapY * collisionDirection(dy, firstIndex, secondIndex),
    };
}

/** @param {ConstraintItem[]} items */
function hasSignificantOverlap(items) {
    for (let i = 0; i < items.length; i++) {
        const first = items[i];
        if (first.width == 0 || first.height == 0) {
            continue;
        }

        for (let j = i + 1; j < items.length; j++) {
            if (overlapDepth(first, items[j]) > OVERLAP_EPSILON) {
                return true;
            }
        }
        for (const obstacle of items) {
            if (obstacle.anchorWidth == 0 || obstacle.anchorHeight == 0) {
                continue;
            }
            const overlapX =
                (first.width + obstacle.anchorWidth) / 2 +
                COLLISION_PADDING -
                Math.abs(first.x - obstacle.anchorX);
            const overlapY =
                (first.height + obstacle.anchorHeight) / 2 +
                COLLISION_PADDING -
                Math.abs(first.y - obstacle.anchorY);
            if (overlapX > OVERLAP_EPSILON && overlapY > OVERLAP_EPSILON) {
                return true;
            }
        }
    }
    return false;
}

/**
 * @param {{ x: number, y: number, width: number, height: number }} first
 * @param {{ x: number, y: number, width: number, height: number }} second
 */
function overlapDepth(first, second) {
    if (second.width == 0 || second.height == 0) {
        return 0;
    }

    const overlapX =
        (first.width + second.width) / 2 +
        COLLISION_PADDING -
        Math.abs(first.x - second.x);
    const overlapY =
        (first.height + second.height) / 2 +
        COLLISION_PADDING -
        Math.abs(first.y - second.y);
    return overlapX > 0 && overlapY > 0 ? Math.min(overlapX, overlapY) : 0;
}

/**
 * @param {number} x1
 * @param {number} y1
 * @param {number} width1
 * @param {number} height1
 * @param {number} x2
 * @param {number} y2
 * @param {number} width2
 * @param {number} height2
 */
function rectanglesOverlap(x1, y1, width1, height1, x2, y2, width2, height2) {
    return (
        width1 > 0 &&
        height1 > 0 &&
        width2 > 0 &&
        height2 > 0 &&
        Math.abs(x1 - x2) * 2 < width1 + width2 + COLLISION_PADDING * 2 &&
        Math.abs(y1 - y2) * 2 < height1 + height2 + COLLISION_PADDING * 2
    );
}

/**
 * @param {number} center
 * @param {number} size
 * @param {[number, number] | undefined} extent
 */
function fitsExtent(center, size, extent) {
    return (
        !extent ||
        size > extent[1] - extent[0] ||
        (center - size / 2 >= extent[0] && center + size / 2 <= extent[1])
    );
}

/** @param {number} delta @param {number} first @param {number} second */
function collisionDirection(delta, first, second) {
    return delta == 0
        ? pairHash(first, second) & 2
            ? -1
            : 1
        : Math.sign(delta);
}

/** @param {number} first @param {number} second */
function pairHash(first, second) {
    return (
        (Math.imul(first + 1, 0x9e3779b1) ^
            Math.imul(second + 1, 0x85ebca6b)) >>>
        0
    );
}

/** @param {number} priority @param {number} count */
function mobility(priority, count) {
    return count <= 1 ? 1 : 0.2 + (0.8 * priority) / (count - 1);
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
