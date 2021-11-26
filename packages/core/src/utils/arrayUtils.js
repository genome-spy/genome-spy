/**
 * @param {T[]} a
 * @param {T[]} b
 * @template T
 */
export function shallowArrayEquals(a, b) {
    return a.length == b.length && a.every((s, i) => a[i] === b[i]);
}

/**
 * @param {A[]} a
 * @param {B[]} b
 * @param {function(A):T} aAccessor
 * @param {function(B):T} bAccessor
 * @template A, B, T
 */
export function shallowArrayEqualsWithAccessors(a, b, aAccessor, bAccessor) {
    return (
        a.length == b.length &&
        a.every((s, i) => aAccessor(a[i]) === bAccessor(b[i]))
    );
}

/**
 *
 * @param {any[]} a
 */
export function isHomogeneous(a) {
    if (a.length <= 1) {
        return true;
    }

    const first = a[0];
    return a.every((x) => x === first);
}

/**
 * @param {T[] | T} obj
 * @returns {T[]}
 * @template T
 */
export function asArray(obj) {
    if (Array.isArray(obj)) {
        return obj;
    } else if (typeof obj != "undefined") {
        return [obj];
    } else {
        return [];
    }
}

/**
 * Returns the last element of an array.
 * Like vega-util's peek but with stricter typings
 *
 * @param {T[]} arr
 * @template T
 */
export function peek(arr) {
    return arr[arr.length - 1];
}
