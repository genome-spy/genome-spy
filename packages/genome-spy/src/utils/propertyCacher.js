const cacheMapKey = Symbol("cacheMap");

/**
 * @param {object} host The object that uses caching
 * @param {any} key string
 * @param {function(key?):T} callable A function that produces a value to be cached
 * @returns {T}
 * @template T
 */
export function getCachedOrCall(host, key, callable) {
    let value = getCacheMap(host).get(key);
    if (value === undefined) {
        value = callable(key);
        getCacheMap(host).set(key, value);
    }
    return value;
}

/**
 *
 * @param {object} host The object that uses caching
 * @param {string} key
 */
export function invalidate(host, key) {
    getCacheMap(host).delete(key);
}

/**
 *
 * @param {object} host The object that uses caching
 * @param {string} keyPrefix
 */
export function invalidatePrefix(host, keyPrefix) {
    const m = getCacheMap(host);
    for (const key of m.keys()) {
        if (key.startsWith(keyPrefix)) {
            m.delete(key);
        }
    }
    getCacheMap(host).delete(keyPrefix);
}
/**
 *
 * @param {object} host The object that uses caching
 */
export function invalidateAll(host) {
    getCacheMap(host).clear();
}

/**
 * @param {any} host The object that uses caching
 */
export function initPropertyCache(host) {
    /** @type {Map<string, any>} */
    host[cacheMapKey] = new Map();
}

/**
 * @param {any} host The object that uses caching
 * @returns {Map<string, any>}
 */
function getCacheMap(host) {
    if (host[cacheMapKey]) {
        return host[cacheMapKey];
    }

    initPropertyCache(host);

    return host[cacheMapKey];
}
