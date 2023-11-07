import { isInlineData } from "./inlineSource.js";

/**
 * Validates data source params, infers format if not specified explicitly,
 * returns a complete DataSource params object.
 *
 * @param {import("../../spec/data").DataSource} params
 *      DataSource parameters
 */
export function getFormat(params) {
    if (!isInlineData(params) && !isUrlData(params)) {
        return;
    }
    const format = { ...params.format };

    format.type ??= isUrlData(params) && extractTypeFromUrl(params.url);
    // @ts-ignore TODO: Fix typing
    format.parse ??= "auto";

    if (!format.type) {
        throw new Error(
            "Format for the data source was not defined and it could not be inferred: " +
                JSON.stringify(params)
        );
    }

    return format;
}

/**
 * @param {string | string[]} url
 */
export function extractTypeFromUrl(url) {
    if (Array.isArray(url)) {
        url = url[0];
    }

    if (url) {
        return url.match(/\.(csv|tsv|json)/)?.[1];
    }
}

export const makeWrapper = (/** @type {any} */ d) =>
    typeof d != "object" ? scalarWrapper : nopWrapper;

const scalarWrapper = (
    /** @type {import("../../spec/channel").Scalar} */ x
) => ({ data: x });

const nopWrapper = (/** @type {import("../flowNode").Datum} */ x) => x;

/**
 * @param {import("../../spec/data").DataFormat} dataFormat
 * @return {dataFormat is import("../../spec/data").CsvDataFormat}
 */
export function isCsvDataFormat(dataFormat) {
    return dataFormat.type == "csv" || dataFormat.type == "tsv";
}

/**
 * @param {import("../../spec/data").DataFormat} dataFormat
 * @return {dataFormat is import("../../spec/data").DsvDataFormat}
 */
export function isDsvDataFormat(dataFormat) {
    return dataFormat.type == "dsv";
}

/**
 * @param {import("../../spec/data").DataFormat} dataFormat
 * @return {dataFormat is import("../../spec/data").JsonDataFormat}
 */
export function isJsonDataFormat(dataFormat) {
    return dataFormat.type == "json";
}

/**
 *
 * @param {import("../../spec/data").DataSource} dataSource
 * @return {dataSource is import("../../spec/data").UrlData}
 */
export function isUrlData(dataSource) {
    return "url" in dataSource;
}
