/**
 * @typedef {[number, number]} LabelBounds
 */

/**
 * Removes overlapping label bounds while retaining at least the first and last
 * candidates.
 *
 * The reduction policy is adapted from Vega's axis-label overlap transform:
 * https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-view-transforms/src/Overlap.js
 * Vega is distributed under the BSD-3-Clause license.
 *
 * @template T
 * @param {T[]} candidates Ordered in axis tick order
 * @param {(candidate: T) => LabelBounds} getBounds
 * @param {"parity" | "greedy"} method
 * @param {number} separation
 * @returns {T[]}
 */
export function removeOverlappingAxisLabels(
    candidates,
    getBounds,
    method,
    separation
) {
    if (
        candidates.length < 3 ||
        !hasOverlap(candidates, getBounds, separation)
    ) {
        return candidates;
    }

    let retained = candidates;

    do {
        switch (method) {
            case "parity":
                retained = retainParity(retained);
                break;
            case "greedy":
                retained = retainGreedy(retained, getBounds, separation);
                break;
            default:
                throw new Error("Invalid axis label overlap method: " + method);
        }
    } while (
        retained.length >= 3 &&
        hasOverlap(retained, getBounds, separation)
    );

    const lastCandidate = candidates.at(-1);
    if (retained.length < 3 && retained.at(-1) !== lastCandidate) {
        if (retained.length > 1) {
            retained.pop();
        }
        retained.push(lastCandidate);
    }

    return retained;
}

/**
 * @template T
 * @param {T[]} candidates
 * @returns {T[]}
 */
function retainParity(candidates) {
    return candidates.filter((candidate, index) => index % 2 == 0);
}

/**
 * @template T
 * @param {T[]} candidates
 * @param {(candidate: T) => LabelBounds} getBounds
 * @param {number} separation
 * @returns {T[]}
 */
function retainGreedy(candidates, getBounds, separation) {
    /** @type {T[]} */
    const retained = [];
    /** @type {LabelBounds} */
    let previousBounds;

    for (const candidate of candidates) {
        const bounds = getBounds(candidate);
        if (
            previousBounds == undefined ||
            !boundsOverlap(previousBounds, bounds, separation)
        ) {
            retained.push(candidate);
            previousBounds = bounds;
        }
    }

    return retained;
}

/**
 * @template T
 * @param {T[]} candidates
 * @param {(candidate: T) => LabelBounds} getBounds
 * @param {number} separation
 */
function hasOverlap(candidates, getBounds, separation) {
    let previousBounds = getBounds(candidates[0]);

    for (let i = 1; i < candidates.length; i++) {
        const bounds = getBounds(candidates[i]);
        if (boundsOverlap(previousBounds, bounds, separation)) {
            return true;
        }
        previousBounds = bounds;
    }

    return false;
}

/**
 * Tests intersection symmetrically so bounds may be ordered in either axis
 * direction.
 *
 * @param {LabelBounds} a
 * @param {LabelBounds} b
 * @param {number} separation
 */
function boundsOverlap(a, b, separation) {
    return separation > Math.max(b[0] - a[1], a[0] - b[1]);
}
