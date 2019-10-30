/**
 * 
 * @param {any[]} a 
 * @param {any[]} b 
 */
export function shallowArrayEquals(a, b) {
    return a.length == b.length && a.every((s, i) => b[i] == s);
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
        return [obj]

    } else {
        return [];
    }
} 