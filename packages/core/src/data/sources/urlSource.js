import { getSpecErrorLocation } from "../../utils/specError.js";
import { logError } from "../../utils/errorPresentation.js";
import { read } from "vega-loader";
import {
    getFormat,
    hasGzipExtension,
    responseType,
    toVegaLoaderFormat,
} from "./dataUtils.js";
import DataSource from "./dataSource.js";
import {
    activateExprRefProps,
    withoutExprRef,
} from "../../paramRuntime/paramUtils.js";
import { concatUrl } from "../../utils/url.js";
import {
    createDescriptorFieldAttacher,
    getUrlDescriptorExpressions,
    loadUrlDescriptorOrSkip,
    normalizeUrlDescriptors,
    UrlLimitExceededError,
} from "./urlDescriptor.js";

const gzipMimeTypes = new Set(["application/gzip", "application/x-gzip"]);
const textDecoder = new TextDecoder();

/**
 * Loads eager data from URLs and transparently decompresses gzip-compatible
 * payloads before handing them to the registered format reader.
 */
export default class UrlSource extends DataSource {
    #loadId = 0;

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
            getUrlDescriptorExpressions(params.url)
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

        const content = await loadResponse(listUrl, responseType(format.type));

        const files = /** @type {string[] | {url: string}[]} */ (
            read(content, toVegaLoaderFormat(format))
        )
            .map((u) => (typeof u === "string" ? u : u.url))
            .map((u) => concatUrl(listUrl, u));

        return files;
    }

    async load() {
        if (this.disposed) return;

        const loadId = ++this.#loadId;
        const isCurrent = () => !this.disposed && loadId === this.#loadId;

        this.setLoadingStatus("loading");
        this.reset();

        /** @type {(Error & { errorPhase?: import("../../types/embedApi.js").DataLoadingEntry["errorPhase"] }) | undefined} */
        let error;
        try {
            const url = withoutExprRef(this.params.url);

            /** @type {import("./urlDescriptor.js").UrlDescriptor[]} */
            const descriptors =
                typeof url == "object" && "urlsFromFile" in url
                    ? (await this.#loadUrlsFromFile(url)).map((url) => ({
                          url,
                      }))
                    : await normalizeUrlDescriptors({
                          url: this.params.url,
                          baseUrl: this.baseUrl,
                          paramRuntime: this.paramRuntime,
                      });

            if (!isCurrent()) return;

            const urls = descriptors.map((descriptor) => descriptor.url);
            if (urls.length > 0 && urls[0]) {
                const format = getFormat(this.params, urls);
                const type = responseType(format.type);

                /**
                 * @param {any} content
                 * @param {import("./urlDescriptor.js").UrlDescriptor} descriptor
                 */
                const readAndParse = async (content, descriptor) => {
                    try {
                        /** @type {any[] | Promise<any[]>} */
                        const dataOrPromise = read(
                            content,
                            toVegaLoaderFormat(format)
                        );
                        const data =
                            dataOrPromise instanceof Promise
                                ? await dataOrPromise
                                : dataOrPromise;
                        if (!isCurrent()) return;

                        this.beginBatch({ type: "file", url: descriptor.url });
                        const attachFields = createDescriptorFieldAttacher(
                            descriptor.fields
                        );
                        for (const d of data) {
                            this._propagate(attachFields(d));
                        }
                    } catch (e) {
                        if (!isCurrent()) return;
                        throw new Error(
                            `Cannot parse: ${descriptor.url}: ${e.message}`,
                            {
                                cause: e,
                            }
                        );
                    }
                };

                const loaded = await Promise.all(
                    descriptors.map((descriptor) =>
                        loadUrlDescriptorOrSkip(descriptor, async () => ({
                            descriptor,
                            content: await loadResponse(descriptor.url, type),
                        }))
                    )
                );

                if (!isCurrent()) return;

                await Promise.all(
                    loaded.map((entry) =>
                        entry
                            ? readAndParse(entry.content, entry.descriptor)
                            : undefined
                    )
                );
            }
        } catch (cause) {
            if (!(cause instanceof UrlLimitExceededError)) error = cause;
        }
        if (!isCurrent()) return;

        // Finish failed/empty streams too, but never retry completion if it throws.
        try {
            this.complete();
        } catch (cause) {
            error ??= cause;
        }
        if (!isCurrent()) return;

        if (error) {
            logError(error);
            this.setLoadingStatus(
                "error",
                error.message,
                error.errorPhase ?? "processing",
                getSpecErrorLocation(error)
            );
        } else {
            this.setLoadingStatus("complete");
        }
    }
}

/**
 * @param {string} url
 * @param {string} type
 */
async function loadResponse(url, type) {
    let result;
    try {
        result = await fetch(url);
        if (!result.ok)
            throw new Error(`${result.status} ${result.statusText}`);
    } catch (cause) {
        throw Object.assign(
            new Error(`Could not load data: ${url}. Reason: ${cause.message}`, {
                cause,
            }),
            { errorPhase: "request" }
        );
    }
    return readResponseBody(result, url, type);
}

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
    return (
        bytes.length >= 10 &&
        bytes[0] == 0x1f &&
        bytes[1] == 0x8b &&
        bytes[2] == 0x08 &&
        (bytes[3] & 0xe0) == 0
    );
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
    const gzipHint =
        hasGzipExtension(url) ||
        isGzipMimeType(response.headers.get("content-type")) ||
        hasGzipContentEncoding(response.headers.get("content-encoding"));

    if (!gzipHint) {
        return readResponseUsingType(response, type);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const bodyBytes = hasGzipMagic(bytes) ? await decompressGzip(bytes) : bytes;
    return deserializeBytes(bodyBytes, type);
}

/**
 * @param {Response} response
 * @param {string} type
 */
function readResponseUsingType(response, type) {
    // @ts-ignore
    return typeof response[type] == "function"
        ? // @ts-ignore
          response[type]()
        : response.text();
}

/**
 * @param {Uint8Array} bytes
 * @param {string} type
 */
function deserializeBytes(bytes, type) {
    if (type == "arrayBuffer") {
        return toArrayBuffer(bytes);
    } else {
        return textDecoder.decode(bytes);
    }
}
