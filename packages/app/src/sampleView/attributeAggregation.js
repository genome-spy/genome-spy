/**
 * @param {number[]} values
 * @returns {number}
 */
export function aggregateMin(values) {
    if (!values.length) {
        return;
    }

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
    if (!values.length) {
        return;
    }

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
    if (!values.length) {
        return;
    }

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
 * @param {number[]} values
 * @returns {number}
 */
export function aggregateCount(values) {
    return values.length;
}
