/*
 * Adapted from: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set#implementing_basic_set_operations
 */

/**
 * @param {Set<T>} set
 * @param {Set<T>} subset
 * @template T
 */
export function isSuperset(set, subset) {
    for (let elem of subset) {
        if (!set.has(elem)) {
            return false;
        }
    }
    return true;
}

/**
 * @param {Set<T>} setA
 * @param {Set<T>} setB
 * @template T
 */
export function union(setA, setB) {
    let _union = new Set(setA);
    for (let elem of setB) {
        _union.add(elem);
    }
    return _union;
}

/**
 * @param {Set<T>} setA
 * @param {Set<T>} setB
 * @template T
 */
export function intersection(setA, setB) {
    let _intersection = new Set();
    for (let elem of setB) {
        if (setA.has(elem)) {
            _intersection.add(elem);
        }
    }
    return _intersection;
}

/**
 * @param {Set<T>} setA
 * @param {Set<T>} setB
 * @template T
 */
export function symmetricDifference(setA, setB) {
    let _difference = new Set(setA);
    for (let elem of setB) {
        if (_difference.has(elem)) {
            _difference.delete(elem);
        } else {
            _difference.add(elem);
        }
    }
    return _difference;
}

/**
 * @param {Set<T>} setA
 * @param {Set<T>} setB
 * @template T
 */
export function difference(setA, setB) {
    let _difference = new Set(setA);
    for (let elem of setB) {
        _difference.delete(elem);
    }
    return _difference;
}
