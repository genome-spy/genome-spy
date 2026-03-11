import { read } from "vega-loader";
import { getFormat, hasGzipExtension, responseType } from "./dataUtils.js";
import DataSource from "./dataSource.js";
import {
    activateExprRefProps,
    withoutExprRef,
} from "../../paramRuntime/paramUtils.js";
import { concatUrl } from "../../utils/url.js";

const gzipMimeTypes = new Set(["application/gzip", "application/x-gzip"]);
const textDecoder = new TextDecoder();

/**
 * @param {Partial<import("../../spec/data.js").Data>} data
 * @returns {data is import("../../spec/data.js").UrlData}
 */
export function isUrlData(data) {
    return "url" in data;
}

/**
 * @param {Uint8Array} bytes
 */
function hasGzipMagic(bytes) {
    return bytes.length >= 2 && bytes[0] == 0x1f && bytes[1] == 0x8b;
}

/**
 * @param {string | null} contentType
 */
function isGzipMimeType(contentType) {
    if (!contentType) {
        return false;
    }

    return gzipMimeTypes.has(contentType.split(";")[0].trim().toLowerCase());
}

/**
 * @param {string | null} contentEncoding
 */
function hasGzipContentEncoding(contentEncoding) {
    if (!contentEncoding) {
        return false;
    }

    return contentEncoding
        .toLowerCase()
        .split(",")
        .some((encoding) => encoding.trim() == "gzip");
}

/**
 * @param {Uint8Array} bytes
 * @returns {ArrayBuffer}
 */
function toArrayBuffer(bytes) {
    return new Uint8Array(bytes).buffer;
}

/**
 * @param {Uint8Array} bytes
 */
async function decompressGzip(bytes) {
    if (typeof DecompressionStream != "function") {
        throw new Error(
            "Gzip-compressed URL data requires DecompressionStream support."
        );
    }

    const body = new Response(toArrayBuffer(bytes)).body;
    if (!body) {
        throw new Error(
            "Cannot create a readable stream for gzip decompression."
        );
    }

    const stream = body.pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * @param {Response} response
 * @param {string} url
 * @param {string} type
 */
async function readResponseBody(response, url, type) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    const gzipHint =
        hasGzipExtension(url) ||
        isGzipMimeType(response.headers.get("content-type"));
    const contentEncoding = response.headers.get("content-encoding");

    let bodyBytes = bytes;
    if (hasGzipMagic(bytes)) {
        bodyBytes = await decompressGzip(bytes);
    } else if (gzipHint && !hasGzipContentEncoding(contentEncoding)) {
        throw new Error(
            `Expected gzip-compressed data in "${url}", but the payload is not gzipped.`
        );
    }

    if (type == "arrayBuffer") {
        return toArrayBuffer(bodyBytes);
    } else {
        return textDecoder.decode(bodyBytes);
    }
}

export default class UrlSource extends DataSource {
    /**
     * @param {import("../../spec/data.js").UrlData} params
     * @param {import("../../view/view.js").default} view
     */
    constructor(params, view) {
        super(view);

        this.params = activateExprRefProps(
            view.paramRuntime,
            params,
            () => this.load(),
            (disposer) => this.registerDisposer(disposer),
            { batchMode: "whenPropagated" }
        );

        this.baseUrl = view?.getBaseUrl();
    }

    get identifier() {
        return JSON.stringify({ params: this.params, baseUrl: this.baseUrl });
    }

    get label() {
        return "urlSource";
    }

    /**
     *
     * @param {import("../../spec/data.js").UrlList} props
     */
    async #loadUrlsFromFile(props) {
        const listUrl = concatUrl(this.baseUrl, props.urlsFromFile);
        const format = { type: props.type ?? "tsv" };

        const result = await fetch(listUrl);

        if (!result.ok) {
            throw new Error(
                `Cannot load "${listUrl}": ${result.status} ${result.statusText}`
            );
        }
        const content = await readResponseBody(
            result,
            listUrl,
            responseType(format.type)
        );

        const files = /** @type {string[] | {url: string}[]} */ (
            read(content, format)
        )
            .map((u) => (typeof u === "string" ? u : u.url))
            .map((u) => concatUrl(listUrl, u));

        return files;
    }

    async load() {
        const url = withoutExprRef(this.params.url);

        /** @type {string[]} */
        const urls =
            typeof url == "object" && "urlsFromFile" in url
                ? await this.#loadUrlsFromFile(url)
                : (Array.isArray(url) ? url : [url]).map((u) =>
                      concatUrl(this.baseUrl, u)
                  );

        const format = getFormat(this.params, urls);
        const type = responseType(format.type);

        if (urls.length === 0 || !urls[0]) {
            this.reset();
            this.complete();
            return;
        }

        /** @param {string} url */
        const load = async (url) => {
            try {
                const result = await fetch(url);
                if (!result.ok) {
                    throw new Error(`${result.status} ${result.statusText}`);
                }
                return await readResponseBody(result, url, type);
            } catch (e) {
                throw new Error(
                    `Could not load data: ${url}. Reason: ${e.message}`
                );
            }
        };

        /**
         * @param {any} content
         * @param {string} [url]
         */
        const readAndParse = async (content, url) => {
            try {
                /** @type {any[] | Promise<any[]>} */
                const dataOrPromise = read(content, format);
                const data =
                    dataOrPromise instanceof Promise
                        ? await dataOrPromise
                        : dataOrPromise;
                this.beginBatch({ type: "file", url: url });
                for (const d of data) {
                    this._propagate(d);
                }
            } catch (e) {
                console.warn(e);
                throw new Error(`Cannot parse: ${url}: ${e.message}`);
            }
        };

        this.setLoadingStatus("loading");
        this.reset();

        try {
            await Promise.all(urls.map((url) => load(url).then(readAndParse)));
            this.setLoadingStatus("complete");
        } catch (e) {
            this.setLoadingStatus("error", e.message);
        }
        this.complete();
    }
}
