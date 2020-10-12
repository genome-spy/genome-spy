const cacheGroupKey = Symbol("cacheGroup");

/**
 * @param {object} host The object that uses caching
 * @param {any} key string
 * @param {function(key?):T} callable A function that produces a value to be cached
 * @returns {T}
 * @template T
 */
export function getCachedOrCall(host, key, callable) {
    let value = getCacheGroup(host).get(key);
    if (value === undefined) {
        value = callable(key);
        getCacheGroup(host).set(key, value);
    }
    return value;
}

/**
 *
 * @param {object} host The object that uses caching
 * @param {string} key
 */
export function expire(host, key) {
    getCacheGroup(host).delete(key);
}

/**
 *
 * @param {object} host The object that uses caching
 */
export function expireAll(host) {
    getCacheGroup(host).clear();
}

/**
 * @param {any} host The object that uses caching
 * @returns {Map<string, any>}
 */
function getCacheGroup(host) {
    if (host[cacheGroupKey]) {
        return host[cacheGroupKey];
    }

    /** @type {Map<string, any>} */
    host[cacheGroupKey] = new Map();

    return host[cacheGroupKey];
}
