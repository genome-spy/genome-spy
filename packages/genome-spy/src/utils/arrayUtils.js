/**
 *
 * @param {A[]} a
 * @param {B[]} b
 * @param {function(A):T} [aAccessor]
 * @param {function(B):T} [bAccessor]
 * @template A, B, T
 */
export function shallowArrayEquals(a, b, aAccessor, bAccessor) {
    aAccessor = aAccessor || (x => x);
    bAccessor = bAccessor || (x => x);
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
    return a.every(x => x === first);
}

/**
 *
 * @param {any[] | any} obj
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
