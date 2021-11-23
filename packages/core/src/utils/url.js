const protoRe = /^([A-Za-z]+:)?\/\//;

/**
 * Append a relative or absolute url to a base url.
 * The base part is omitted if the append part is absolute.
 *
 * @param {function():string} baseAccessor
 * @param {string} append
 */
export function appendToBaseUrl(baseAccessor, append) {
    if (append && protoRe.test(append)) {
        return append;
    }

    const base = baseAccessor();

    if (base && append) {
        return base.endsWith("/") ? base + append : base + "/" + append;
    }

    return base ?? append;
}
