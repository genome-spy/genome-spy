/**
 * Finds the minimum-squared-displacement placement for ordered items with
 * non-overlapping one-dimensional collision intervals.
 *
 * The separation constraints are reduced to equal-weight least-squares
 * isotonic regression and solved using the pool-adjacent-violators algorithm.
 * Based on the formulation in
 * plans/displace1d/one-dimensional-item-placement.md. For a practical
 * description of linear-time PAVA implementations, see
 * https://doi.org/10.18637/jss.v102.c01.
 *
 * @param {number[]} positions Original centers in ascending order.
 * @param {number[]} lengths Full collision lengths.
 * @param {number[]} [output] Reusable output array for signed displacements.
 * @returns {number[]} The output array.
 */
export function solveDisplacement(positions, lengths, output = []) {
    if (positions.length != lengths.length) {
        throw new Error(
            "displace1d positions and lengths must have the same number of values."
        );
    }

    /** @type {number[]} */
    const blockCounts = [];
    /** @type {number[]} */
    const blockMeans = [];
    output.length = positions.length;

    let cumulativeSeparation = 0;
    let previousLength = 0;
    let previousPosition = -Infinity;

    for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        const length = lengths[i];

        if (!Number.isFinite(position)) {
            throw new Error("displace1d positions must be finite numbers.");
        } else if (!Number.isFinite(length) || length < 0) {
            throw new Error(
                "displace1d lengths must be finite non-negative numbers."
            );
        } else if (position < previousPosition) {
            throw new Error(
                "displace1d items must be ordered by ascending position."
            );
        }

        if (i > 0) {
            cumulativeSeparation += (previousLength + length) / 2;
        }

        blockCounts.push(1);
        blockMeans.push(position - cumulativeSeparation);

        while (blockMeans.length > 1 && blockMeans.at(-2) > blockMeans.at(-1)) {
            const upperCount = blockCounts.pop();
            const upperMean = blockMeans.pop();
            const lowerIndex = blockCounts.length - 1;
            const lowerCount = blockCounts[lowerIndex];
            const count = lowerCount + upperCount;

            blockMeans[lowerIndex] =
                (blockMeans[lowerIndex] * lowerCount + upperMean * upperCount) /
                count;
            blockCounts[lowerIndex] = count;
        }

        previousLength = length;
        previousPosition = position;
    }

    cumulativeSeparation = 0;
    previousLength = 0;
    let blockIndex = 0;
    let remainingInBlock = blockCounts[0] ?? 0;

    for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        const length = lengths[i];

        if (i > 0) {
            cumulativeSeparation += (previousLength + length) / 2;
        }

        output[i] = blockMeans[blockIndex] + cumulativeSeparation - position;

        remainingInBlock--;
        if (remainingInBlock == 0) {
            blockIndex++;
            remainingInBlock = blockCounts[blockIndex] ?? 0;
        }

        previousLength = length;
    }

    return output;
}
