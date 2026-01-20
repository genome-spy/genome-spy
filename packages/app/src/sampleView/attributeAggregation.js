/**
 * @param {number[]} values
 * @returns {number}
 */
export function aggregateMin(values) {
    let min = values[0];
    for (let i = 1; i < values.length; i++) {
        const value = values[i];
        if (value < min) {
            min = value;
        }
    }
    return min;
}

/**
 * @param {number[]} values
 * @returns {number}
 */
export function aggregateMax(values) {
    let max = values[0];
    for (let i = 1; i < values.length; i++) {
        const value = values[i];
        if (value > max) {
            max = value;
        }
    }
    return max;
}

/**
 * @param {number[]} values
 * @param {number[]} weights
 * @returns {number}
 */
export function aggregateWeightedMean(values, weights) {
    let sum = 0;
    let weightSum = 0;
    for (let i = 0; i < values.length; i++) {
        const weight = weights[i];
        sum += values[i] * weight;
        weightSum += weight;
    }

    if (weightSum === 0) {
        return;
    }

    return sum / weightSum;
}

/**
 * Computes a (possibly weighted) population variance.
 *
 * @param {number[]} values
 * @param {number[]} weights
 * @returns {number}
 */
export function aggregateVariance(values, weights) {
    let weightedSum = 0;
    let weightSum = 0;
    for (let i = 0; i < values.length; i++) {
        const weight = weights[i];
        weightedSum += values[i] * weight;
        weightSum += weight;
    }

    if (weightSum === 0) {
        return;
    }

    const mean = weightedSum / weightSum;
    let varianceSum = 0;
    for (let i = 0; i < values.length; i++) {
        const diff = values[i] - mean;
        varianceSum += weights[i] * diff * diff;
    }

    return varianceSum / weightSum;
}

/**
 * @param {number[]} values
 * @returns {number}
 */
export function aggregateCount(values) {
    return values.length;
}
