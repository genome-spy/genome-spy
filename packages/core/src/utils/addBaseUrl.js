/**
 * @param {string} url
 * @param {string} baseUrl
 */
export default function addBaseUrl(url, baseUrl) {
    // Regex copied from vega-loader
    if (!baseUrl || /^(data:|([A-Za-z]+:)?\/\/)/.test(url)) {
        return url;
    }

    if (!url.startsWith("/")) {
        if (!baseUrl.endsWith("/")) {
            baseUrl += "/";
        }
        return baseUrl + url;
    }

    return url;
}

/**
 *
 * @param {string} url
 * @returns {string}
 */
export function endWithSlash(url) {
    if (!url) {
        return url;
    }

    if (/[?#]/.test(url)) {
        throw new Error(
            `Invalid base URL: ${url} - cannot contain query or hash.`
        );
    }
    return url.endsWith("/") ? url : url + "/";
}
