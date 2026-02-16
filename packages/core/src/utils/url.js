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
 * Resolves a URL against a possibly relative base URL and runtime location.
 *
 * Unlike concatUrl, this function can normalize path segments ("..", ".")
 * when enough context exists (absolute base or runtime base URI).
 *
 * @param {string | (() => string)} base
 * @param {string} append
 * @param {string | null} [runtimeBase]
 * @returns {string}
 */
export function resolveUrl(base, append, runtimeBase = getRuntimeBase()) {
    const baseString = typeof base == "function" ? base() : base;
    if (!append) {
        return baseString;
    }

    try {
        if (baseString) {
            const absoluteBase = runtimeBase
                ? new URL(baseString, runtimeBase).href
                : new URL(baseString).href;
            return new URL(append, absoluteBase).href;
        } else if (runtimeBase) {
            return new URL(append, runtimeBase).href;
        }
    } catch (_error) {
        // Fall back to simple concatenation below.
    }

    return concatUrl(baseString, append);
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

/**
 * @returns {string | undefined}
 */
function getRuntimeBase() {
    if (typeof document !== "undefined" && document.baseURI) {
        return document.baseURI;
    }
    if (typeof window !== "undefined" && window.location?.href) {
        return window.location.href;
    }
}
