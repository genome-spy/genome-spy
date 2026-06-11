// @ts-check
import { isExprRef, withoutExprRef } from "../../paramRuntime/paramUtils.js";
import { concatUrl } from "../../utils/url.js";

/**
 * @typedef {object} UrlDescriptor
 * @prop {string} url
 * @prop {string} [indexUrl]
 * @prop {Record<string, import("../../spec/channel.js").Scalar>} [fields]
 */

/**
 * @typedef {object} UrlDescriptorOptions
 * @prop {any} url
 * @prop {any} [indexUrl]
 * @prop {string} [baseUrl]
 * @prop {{ createExpression: (expr: string) => () => any }} [paramRuntime]
 */

/**
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

    return dedupeAndLimit(resolved, getMaxUrls(options.url));
}

/**
 * @param {{
 *   url: any,
 *   indexUrl?: any,
 *   paramRuntime: { watchExpression?: Function, createExpression: Function },
 *   listener: () => void,
 *   registerDisposer?: (disposer: () => void) => void,
 * }} options
 */
export function watchUrlDescriptorExpressions(options) {
    const expressions = collectUrlExpressions(options.url, options.indexUrl);
    for (const expr of expressions) {
        const fn = options.paramRuntime.watchExpression
            ? options.paramRuntime.watchExpression(expr, options.listener, {
                  scopeOwned: !options.registerDisposer,
                  registerDisposer: options.registerDisposer,
              })
            : options.paramRuntime.createExpression(expr);
        if (!options.paramRuntime.watchExpression && fn.subscribe) {
            const unsubscribe = fn.subscribe(options.listener);
            options.registerDisposer?.(unsubscribe);
        }
    }
}

/**
 * @template {Record<string, any>} T
 * @param {T} datum
 * @param {Record<string, import("../../spec/channel.js").Scalar>} [fields]
 * @returns {T}
 */
export function attachDescriptorFields(datum, fields) {
    if (!fields) {
        return datum;
    }

    for (const [key, value] of Object.entries(fields)) {
        if (key in datum && datum[key] !== value) {
            throw new Error(
                `Descriptor field "${key}" conflicts with loaded datum.`
            );
        }
    }

    return /** @type {T} */ ({
        ...fields,
        ...datum,
    });
}

/**
 * @template {Record<string, any>} T
 * @param {T[]} data
 * @param {Record<string, import("../../spec/channel.js").Scalar>} [fields]
 * @returns {T[]}
 */
export function attachDescriptorFieldsToData(data, fields) {
    return fields
        ? data.map((datum) => attachDescriptorFields(datum, fields))
        : data;
}

/**
 * @param {any} urlSpec
 * @param {UrlDescriptorOptions} options
 * @returns {UrlDescriptor[]}
 */
function expandUrl(urlSpec, options) {
    if (isUrlTemplate(urlSpec)) {
        return expandTemplate(urlSpec, options.indexUrl, options);
    }

    const value = isExprRef(urlSpec)
        ? requireParamRuntime(options).createExpression(urlSpec.expr)()
        : urlSpec;
    const values = Array.isArray(value) ? value : [value];
    return values.map(normalizeDescriptor);
}

/**
 * @param {any} templateSpec
 * @param {any} indexUrlSpec
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
        const fields = { [templateSpec.field]: scalar };
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
        };
    });
}

/**
 * @param {any} values
 * @param {UrlDescriptorOptions} options
 */
function resolveValues(values, options) {
    return isExprRef(values)
        ? requireParamRuntime(options).createExpression(values.expr)()
        : values;
}

/**
 * @param {any} value
 * @returns {UrlDescriptor}
 */
function normalizeDescriptor(value) {
    if (typeof value == "string") {
        return { url: value };
    }
    if (value && typeof value == "object" && typeof value.url == "string") {
        return value;
    }
    throw new Error("URL descriptor must be a string or an object with url.");
}

/**
 * @param {string} template
 * @param {string} field
 * @param {import("../../spec/channel.js").Scalar} value
 */
function fillTemplate(template, field, value) {
    const placeholder = "{" + field + "}";
    if (!template.includes(placeholder)) {
        throw new Error(`URL template must contain ${placeholder}.`);
    }
    return template.replaceAll(placeholder, encodeURIComponent(String(value)));
}

/**
 * @param {UrlDescriptor[]} descriptors
 * @param {number | undefined} maxUrls
 */
function dedupeAndLimit(descriptors, maxUrls) {
    const byKey = new Map();
    for (const descriptor of descriptors) {
        const key = descriptor.url + "\n" + (descriptor.indexUrl ?? "");
        if (!byKey.has(key)) {
            byKey.set(key, descriptor);
        }
    }

    const result = Array.from(byKey.values());
    if (maxUrls !== undefined && result.length > maxUrls) {
        throw new Error(
            `URL expansion resolved ${result.length} URLs, exceeding maxUrls ${maxUrls}.`
        );
    }
    return result;
}

/**
 * @param {any} value
 * @returns {import("../../spec/channel.js").Scalar}
 */
function assertScalar(value) {
    if (
        value == null ||
        typeof value == "object" ||
        typeof value == "function"
    ) {
        throw new Error("URL template values must be scalar in this version.");
    }
    return value;
}

/**
 * @param {any} value
 */
function isUrlTemplate(value) {
    return value && typeof value == "object" && "template" in value;
}

/**
 * @param {any} value
 */
function isIndexTemplate(value) {
    return value && typeof value == "object" && "template" in value;
}

/**
 * @param {any} value
 */
function getMaxUrls(value) {
    return isUrlTemplate(value) ? value.maxUrls : undefined;
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

/**
 * @param {any} url
 * @param {any} indexUrl
 */
function collectUrlExpressions(url, indexUrl) {
    const expressions = [];
    if (isExprRef(url)) {
        expressions.push(url.expr);
    }
    if (isUrlTemplate(url) && isExprRef(url.values)) {
        expressions.push(url.values.expr);
    }
    if (isExprRef(indexUrl)) {
        expressions.push(indexUrl.expr);
    }
    return expressions;
}
