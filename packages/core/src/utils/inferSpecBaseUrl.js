const CURATED_EXAMPLE_BASES = [
    ["/docs/examples/", "/docs/examples/"],
    ["/examples/core/", "/examples/"],
    ["/examples/docs/", "/examples/"],
    ["/examples/app/", "/examples/"],
];

const EXTERNAL_URL_RE = /^(?:[a-z]+:)?\/\//i;
const DUMMY_ORIGIN = "https://example.invalid";

/**
 * @param {string} url
 */
function getUrlKind(url) {
    if (EXTERNAL_URL_RE.test(url)) {
        return "external";
    } else if (url.startsWith("/")) {
        return "root";
    } else {
        return "relative";
    }
}

/**
 * @param {string} url
 */
export function getCuratedExampleBaseUrl(url) {
    const parsed = new URL(url, DUMMY_ORIGIN);
    const match = CURATED_EXAMPLE_BASES.find(([prefix]) =>
        parsed.pathname.startsWith(prefix)
    );

    if (!match) {
        return undefined;
    }

    return formatOutputUrl(match[1], parsed, getUrlKind(url));
}

/**
 * Infers the effective base URL for a spec loaded from the given URL or path.
 *
 * Curated shared examples resolve against the examples root so they can use
 * tidy `data/...` and `shared/...` paths regardless of their subdirectory.
 *
 * @param {string} url
 */
export default function inferSpecBaseUrl(url) {
    const curatedBaseUrl = getCuratedExampleBaseUrl(url);
    if (curatedBaseUrl) {
        return curatedBaseUrl;
    }

    const parsed = new URL(url, DUMMY_ORIGIN);
    const directoryUrl = new URL("./", parsed);

    return formatOutputUrl(directoryUrl.pathname, parsed, getUrlKind(url));
}

/**
 * @param {string} pathname
 * @param {URL} parsed
 * @param {"external" | "root" | "relative"} kind
 */
function formatOutputUrl(pathname, parsed, kind) {
    if (kind === "external") {
        return parsed.origin + pathname;
    } else if (kind === "root") {
        return pathname;
    } else {
        return pathname.slice(1);
    }
}
