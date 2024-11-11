const protoRe = /^([A-Za-z]+:)?\/\//;

/**
 * Append a relative or absolute url to a base url.
 * The base part is omitted if the append part is absolute.
 *
 * If the base part has no trailing slash, it is assumed to be a file and
 * only the directory part is used.
 *
 * @param {string | (() => string)} base
 * @param {string} append
 */
export function concatUrl(base, append) {
    if (append && protoRe.test(append)) {
        return append;
    }

    const baseString = typeof base == "function" ? base() : base;
    if (!baseString) {
        return append;
    }
    if (!append) {
        return baseString;
    }

    if (/[#?]/.test(baseString)) {
        throw new Error(
            `Cannot append to a url with query or hash. Append: ${append}, base: ${baseString}`
        );
    }

    return getDirectory(baseString) + append;
}

/**
 * @param {string} url
 */
export function getDirectory(url) {
    const directory = url.replace(/[^/]*$/, "");
    return directory === ""
        ? undefined
        : directory.endsWith("://")
          ? url + "/"
          : directory;
}
