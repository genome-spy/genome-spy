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
