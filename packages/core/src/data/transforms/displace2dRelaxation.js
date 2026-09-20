const ANCHOR_STRENGTH = 0.002;
const BOUNDS_STRENGTH = 0.08;
const COLLISION_STRENGTH = 0.8;
const COLLISION_PADDING = 2;
const VELOCITY_DECAY = 0.55;
const MAX_STEP = 4;
const MOVEMENT_EPSILON = 0.02;
const SETTLED_ITERATIONS = 3;
const MAX_ITERATIONS = 600;

/**
 * Mutable state for one progressively displaced rectangle.
 *
 * @typedef {object} RelaxationItem
 * @prop {import("../flowNode.js").Datum} datum
 * @prop {number} anchorX
 * @prop {number} anchorY
 * @prop {number} x
 * @prop {number} y
 * @prop {number} vx
 * @prop {number} vy
 * @prop {number} width
 * @prop {number} height
 * @prop {number} anchorWidth
 * @prop {number} anchorHeight
 * @prop {number} priority
 */

/**
 * Progressively relaxes axis-aligned rectangles toward their anchors.
 *
 * Collision corrections are accumulated from one position snapshot and then
 * applied together. This avoids making a visible iteration depend on mutation
 * order while still allowing input order to make earlier labels less mobile.
 */
export class Displace2DRelaxation {
    /** @type {RelaxationItem[]} */
    items;

    /** @type {[number, number] | undefined} */
    xExtent;

    /** @type {[number, number] | undefined} */
    yExtent;

    #fx;
    #fy;
    #iterations = 0;
    #settledIterations = 0;
    #active = true;

    /**
     * @param {RelaxationItem[]} items
     * @param {[number, number]} [xExtent]
     * @param {[number, number]} [yExtent]
     */
    constructor(items, xExtent, yExtent) {
        this.items = items;
        this.xExtent = xExtent;
        this.yExtent = yExtent;
        this.#fx = new Float64Array(items.length);
        this.#fy = new Float64Array(items.length);
    }

    get active() {
        return this.#active;
    }

    /**
     * Advances the relaxation by one fixed iteration.
     *
     * @returns {boolean} Whether any item moved.
     */
    step() {
        if (!this.#active) {
            return false;
        }

        const items = this.items;
        const fx = this.#fx;
        const fy = this.#fy;
        fx.fill(0);
        fy.fill(0);

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            fx[i] += (item.anchorX - item.x) * ANCHOR_STRENGTH;
            fy[i] += (item.anchorY - item.y) * ANCHOR_STRENGTH;
            addBoundsCorrection(item, this.xExtent, this.yExtent, fx, fy, i);
        }

        let overlaps = 0;
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

                overlaps++;
                const firstMobility = mobility(first.priority, items.length);
                const secondMobility = mobility(second.priority, items.length);
                const mobilitySum = firstMobility + secondMobility;
                const firstShare = firstMobility / mobilitySum;
                const secondShare = secondMobility / mobilitySum;
                fx[i] += correction.x * firstShare * COLLISION_STRENGTH;
                fy[i] += correction.y * firstShare * COLLISION_STRENGTH;
                fx[j] -= correction.x * secondShare * COLLISION_STRENGTH;
                fy[j] -= correction.y * secondShare * COLLISION_STRENGTH;
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
                if (!correction) {
                    continue;
                }

                overlaps++;
                fx[i] += correction.x * COLLISION_STRENGTH;
                fy[i] += correction.y * COLLISION_STRENGTH;
            }
        }

        let maxMovement = 0;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.width == 0 || item.height == 0) {
                item.x = item.anchorX;
                item.y = item.anchorY;
                item.vx = 0;
                item.vy = 0;
                continue;
            }

            item.vx = clamp(
                item.vx * VELOCITY_DECAY + fx[i],
                -MAX_STEP,
                MAX_STEP
            );
            item.vy = clamp(
                item.vy * VELOCITY_DECAY + fy[i],
                -MAX_STEP,
                MAX_STEP
            );
            item.x += item.vx;
            item.y += item.vy;
            maxMovement = Math.max(
                maxMovement,
                Math.abs(item.vx),
                Math.abs(item.vy)
            );
        }

        this.#iterations++;
        if (overlaps == 0 && maxMovement <= MOVEMENT_EPSILON) {
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
}

/**
 * @param {RelaxationItem} item
 * @param {[number, number] | undefined} xExtent
 * @param {[number, number] | undefined} yExtent
 * @param {Float64Array} fx
 * @param {Float64Array} fy
 * @param {number} index
 */
function addBoundsCorrection(item, xExtent, yExtent, fx, fy, index) {
    if (xExtent && item.width <= xExtent[1] - xExtent[0]) {
        const minX = xExtent[0] + item.width / 2;
        const maxX = xExtent[1] - item.width / 2;
        if (item.x < minX) {
            fx[index] += (minX - item.x) * BOUNDS_STRENGTH;
        } else if (item.x > maxX) {
            fx[index] += (maxX - item.x) * BOUNDS_STRENGTH;
        }
    }
    if (yExtent && item.height <= yExtent[1] - yExtent[0]) {
        const minY = yExtent[0] + item.height / 2;
        const maxY = yExtent[1] - item.height / 2;
        if (item.y < minY) {
            fy[index] += (minY - item.y) * BOUNDS_STRENGTH;
        } else if (item.y > maxY) {
            fy[index] += (maxY - item.y) * BOUNDS_STRENGTH;
        }
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

    if (overlapX < overlapY) {
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

/** @param {number} delta @param {number} first @param {number} second */
function collisionDirection(delta, first, second) {
    return delta == 0
        ? ((first * 31 + second * 17) & 1) == 0
            ? -1
            : 1
        : Math.sign(delta);
}

/** @param {number} priority @param {number} count */
function mobility(priority, count) {
    return count <= 1 ? 1 : 0.2 + (0.8 * priority) / (count - 1);
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
