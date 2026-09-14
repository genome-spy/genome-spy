// @ts-check
/**
 * Utilities for turning the different URL source shapes accepted by the spec
 * into a common descriptor array used by eager and lazy sources.
 *
 * A descriptor always has a concrete data URL and may also carry an index URL
 * and fields that should be attached to every datum loaded from that URL. URL
 * templates are intentionally resolved here, outside individual source
 * implementations, so BigWig, Tabix, eager URL loading, and test sources share
 * the same ExprRef evaluation, base URL resolution, deduplication, and
 * descriptor-field conflict behavior.
 */
import { isExprRef, withoutExprRef } from "../../paramRuntime/paramUtils.js";
import { concatUrl } from "../../utils/url.js";

/**
 * @typedef {import("../../spec/channel.js").Scalar} Scalar
 * @typedef {import("../../spec/data.js").UrlSourceRef} UrlSourceRef
 * @typedef {import("../../spec/data.js").SingleUrlSourceRef} SingleUrlSourceRef
 * @typedef {import("../../spec/data.js").MultiUrlSourceRef} MultiUrlSourceRef
 * @typedef {import("../../spec/data.js").IndexUrlSourceRef} IndexUrlSourceRef
 * @typedef {import("../../spec/data.js").UrlTemplate} UrlTemplate
 * @typedef {import("../../spec/data.js").IndexUrlTemplate} IndexUrlTemplate
 * @typedef {import("../../spec/parameter.js").ExprRef} ExprRef
 * @typedef {{
 *     createExpression: (expr: string) => () => unknown,
 * }} UrlExpressionRuntime
 */

/**
 * @typedef {object} UrlDescriptor
 * @prop {string} url
 * @prop {string} [indexUrl]
 * @prop {Record<string, Scalar>} [fields]
 * @prop {"error" | "skip"} [onLoadError]
 */

/**
 * @typedef {object} UrlDescriptorOptions
 * @prop {UrlSourceRef | SingleUrlSourceRef | MultiUrlSourceRef | unknown} url
 * @prop {IndexUrlSourceRef | unknown} [indexUrl]
 * @prop {string} [baseUrl]
 * @prop {UrlExpressionRuntime} [paramRuntime]
 */

/**
 * Thrown when URL expansion resolves more distinct descriptors than the spec
 * allows. Sources may handle this as an intentional empty data state.
 */
export class UrlLimitExceededError extends Error {
    /** @type {number} */
    count;

    /** @type {number} */
    maxValues;

    /**
     * @param {number} count
     * @param {number} maxValues
     */
    constructor(count, maxValues) {
        super(
            `URL expansion resolved ${count} distinct values, exceeding maxValues ${maxValues}.`
        );
        this.name = "UrlLimitExceededError";
        this.count = count;
        this.maxValues = maxValues;
    }
}

/**
 * Expands a URL spec into concrete descriptors, resolves relative URLs against
 * the view base URL, deduplicates the result, and enforces `maxValues`.
 *
 * @param {UrlDescriptorOptions} options
 * @returns {Promise<UrlDescriptor[]>}
 */
export async function normalizeUrlDescriptors(options) {
    const descriptors = expandUrl(options.url, options);
    const resolved = descriptors.map((descriptor) => ({
        ...descriptor,
        url: concatUrl(options.baseUrl, descriptor.url),
        indexUrl: descriptor.indexUrl
            ? concatUrl(options.baseUrl, descriptor.indexUrl)
            : undefined,
    }));

    return dedupeAndLimit(resolved, getMaxValues(options.url));
}

/**
 * Expands a URL spec that is expected to resolve to exactly one descriptor.
 * Sources that still support only one remote file use this to fail before
 * constructing file handles.
 *
 * @param {UrlDescriptorOptions} options
 * @param {string} sourceName
 * @returns {Promise<UrlDescriptor>}
 */
export async function normalizeSingleUrlDescriptor(options, sourceName) {
    const descriptors = await normalizeUrlDescriptors(options);
    if (descriptors.length !== 1) {
        throw new Error(`${sourceName} supports exactly one resolved URL.`);
    }
    return descriptors[0];
}

/**
 * Returns nested expressions that affect URL descriptor expansion. Top-level
 * URL and index expressions are already ordinary source properties.
 *
 * @param {UrlSourceRef | SingleUrlSourceRef | MultiUrlSourceRef | unknown} url
 * @returns {{ key: "url", expr: ExprRef }[]}
 */
export function getUrlDescriptorExpressions(url) {
    return isUrlTemplate(url) && isExprRef(url.values)
        ? [{ key: "url", expr: url.values }]
        : [];
}

/**
 * Creates a mutating attacher for descriptor fields. Descriptor fields are
 * source context from URL expansion, such as `{ sample: "S1" }`. Source-loaded
 * datums are fresh objects, so mutating them avoids per-row cloning while still
 * detecting ambiguous source metadata.
 *
 * @param {Record<string, Scalar>} [fields]
 * @returns {(datum: Record<string, any>) => Record<string, any>}
 */
export function createDescriptorFieldAttacher(fields) {
    if (!fields) {
        return (datum) => datum;
    }

    const entries = Object.entries(fields);
    if (entries.length == 1) {
        const [key, value] = entries[0];
        return (datum) => {
            if (key in datum && datum[key] !== value) {
                throw new Error(
                    `Descriptor field "${key}" conflicts with loaded datum.`
                );
            }
            datum[key] = value;
            return datum;
        };
    }

    return (datum) => {
        for (const [key, value] of entries) {
            if (key in datum && datum[key] !== value) {
                throw new Error(
                    `Descriptor field "${key}" conflicts with loaded datum.`
                );
            }
        }

        for (const [key, value] of entries) {
            datum[key] = value;
        }

        return datum;
    };
}

/**
 * Attaches descriptor fields to a loaded datum.
 *
 * @template {Record<string, any>} T
 * @param {T} datum
 * @param {Record<string, Scalar>} [fields]
 * @returns {T}
 */
export function attachDescriptorFields(datum, fields) {
    return /** @type {T} */ (createDescriptorFieldAttacher(fields)(datum));
}

/**
 * @template {Record<string, any>} T
 * @param {T[]} data
 * @param {Record<string, Scalar>} [fields]
 * @returns {T[]}
 */
export function attachDescriptorFieldsToData(data, fields) {
    if (!fields) {
        return data;
    }

    const attach = createDescriptorFieldAttacher(fields);
    for (let i = 0; i < data.length; i++) {
        data[i] = /** @type {T} */ (attach(data[i]));
    }
    return data;
}

/**
 * Reports and classifies a failed expanded URL load. Missing partitions can be
 * intentional in template-based sources, but strict failure remains the
 * default behavior.
 *
 * @param {UrlDescriptor} descriptor
 * @param {Error} error
 * @returns {boolean}
 */
function shouldSkipUrlLoadError(descriptor, error) {
    if (descriptor.onLoadError == "skip") {
        console.warn(`Skipping failed URL: ${descriptor.url}`, error);
        return true;
    }

    return false;
}

/**
 * Runs a per-descriptor load operation and converts configured failures into
 * skipped results.
 *
 * @template T
 * @param {UrlDescriptor} descriptor
 * @param {() => Promise<T>} load
 * @returns {Promise<T | undefined>}
 */
export async function loadUrlDescriptorOrSkip(descriptor, load) {
    try {
        return await load();
    } catch (e) {
        if (shouldSkipUrlLoadError(descriptor, e)) {
            return undefined;
        }
        throw e;
    }
}

/**
 * Returns a stable key for comparing URL descriptors independently of their
 * position in a descriptor array.
 *
 * @param {UrlDescriptor} descriptor
 */
export function urlDescriptorKey(descriptor) {
    return JSON.stringify({
        url: descriptor.url,
        indexUrl: descriptor.indexUrl,
        fields: descriptor.fields
            ? Object.fromEntries(Object.entries(descriptor.fields).sort())
            : undefined,
    });
}

/**
 * @param {UrlSourceRef | SingleUrlSourceRef | MultiUrlSourceRef | unknown} urlSpec
 * @param {UrlDescriptorOptions} options
 * @returns {UrlDescriptor[]}
 */
function expandUrl(urlSpec, options) {
    if (isUrlTemplate(urlSpec)) {
        return expandTemplate(urlSpec, options.indexUrl, options);
    }

    const value = resolveExprRef(urlSpec, options);
    const indexUrl = resolveExprRef(options.indexUrl, options);
    const values = Array.isArray(value) ? value : [value];
    return values.map((value) => {
        const descriptor = normalizeDescriptor(value);
        return typeof indexUrl == "string" && !descriptor.indexUrl
            ? { ...descriptor, indexUrl }
            : descriptor;
    });
}

/**
 * Expands URL templates using a single scalar field. The optional index URL
 * template deliberately reuses the data URL template's `values` and `field` so
 * data/index pairs cannot drift apart.
 *
 * @param {UrlTemplate} templateSpec
 * @param {IndexUrlSourceRef | unknown} indexUrlSpec
 * @param {UrlDescriptorOptions} options
 * @returns {UrlDescriptor[]}
 */
function expandTemplate(templateSpec, indexUrlSpec, options) {
    const values = resolveValues(templateSpec.values, options);
    if (!Array.isArray(values)) {
        throw new Error("URL template values must resolve to an array.");
    }

    return values.map((value) => {
        const scalar = assertScalar(value);
        const fields =
            templateSpec.attach === false
                ? undefined
                : { [templateSpec.field]: scalar };
        return {
            url: fillTemplate(
                templateSpec.template,
                templateSpec.field,
                scalar
            ),
            indexUrl: isIndexTemplate(indexUrlSpec)
                ? fillTemplate(
                      indexUrlSpec.template,
                      templateSpec.field,
                      scalar
                  )
                : /** @type {string | undefined} */ (
                      withoutExprRef(indexUrlSpec)
                  ),
            fields,
            onLoadError: templateSpec.onLoadError,
        };
    });
}

/**
 * @param {UrlTemplate["values"] | unknown} values
 * @param {UrlDescriptorOptions} options
 * @returns {unknown}
 */
function resolveValues(values, options) {
    return resolveExprRef(values, options);
}

/** @param {unknown} value @param {UrlDescriptorOptions} options */
function resolveExprRef(value, options) {
    return isExprRef(value)
        ? requireParamRuntime(options).createExpression(value.expr)()
        : value;
}

/**
 * @param {unknown} value
 * @returns {UrlDescriptor}
 */
function normalizeDescriptor(value) {
    if (typeof value == "string") {
        return { url: value };
    }
    if (
        value &&
        typeof value == "object" &&
        "url" in value &&
        typeof value.url == "string"
    ) {
        return /** @type {UrlDescriptor} */ (value);
    }
    throw new Error("URL descriptor must be a string or an object with url.");
}

/**
 * @param {string} template
 * @param {string} field
 * @param {Scalar} value
 */
function fillTemplate(template, field, value) {
    const placeholder = "{" + field + "}";
    if (!template.includes(placeholder)) {
        throw new Error(`URL template must contain ${placeholder}.`);
    }
    return template.replaceAll(placeholder, encodeURIComponent(String(value)));
}

/**
 * Deduplicates by the complete data/index URL pair. Different index URLs for
 * the same data URL are preserved because they are distinct source
 * descriptors.
 *
 * @param {UrlDescriptor[]} descriptors
 * @param {number | undefined} maxValues
 */
function dedupeAndLimit(descriptors, maxValues) {
    const byKey = new Map();
    for (const descriptor of descriptors) {
        const key = descriptor.url + "\n" + (descriptor.indexUrl ?? "");
        if (!byKey.has(key)) {
            byKey.set(key, descriptor);
        }
    }

    const result = Array.from(byKey.values());
    if (maxValues !== undefined && result.length > maxValues) {
        throw new UrlLimitExceededError(result.length, maxValues);
    }
    return result;
}

/**
 * @param {unknown} value
 * @returns {Scalar}
 */
function assertScalar(value) {
    if (
        value == null ||
        typeof value == "object" ||
        typeof value == "function"
    ) {
        throw new Error("URL template values must be scalar in this version.");
    }
    return /** @type {Scalar} */ (value);
}

/**
 * @param {unknown} value
 * @returns {value is UrlTemplate}
 */
function isUrlTemplate(value) {
    return Boolean(value && typeof value == "object" && "template" in value);
}

/**
 * @param {unknown} value
 * @returns {value is IndexUrlTemplate}
 */
function isIndexTemplate(value) {
    return Boolean(value && typeof value == "object" && "template" in value);
}

/**
 * @param {UrlSourceRef | SingleUrlSourceRef | MultiUrlSourceRef | unknown} value
 * @returns {number | undefined}
 */
function getMaxValues(value) {
    return isUrlTemplate(value) ? value.maxValues : undefined;
}

/**
 * @param {UrlDescriptorOptions} options
 */
function requireParamRuntime(options) {
    if (!options.paramRuntime) {
        throw new Error("URL ExprRef evaluation requires a parameter runtime.");
    }
    return options.paramRuntime;
}
