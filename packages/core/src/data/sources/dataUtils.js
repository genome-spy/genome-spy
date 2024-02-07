import { withoutExprRef } from "../../view/paramMediator.js";
import { isInlineData } from "./inlineSource.js";

/**
 * Validates data source params, infers format if not specified explicitly,
 * returns a complete DataSource params object.
 *
 * @param {import("../../spec/data.js").DataSource} params
 *      DataSource parameters
 */
export function getFormat(params) {
    if (!isInlineData(params) && !isUrlData(params)) {
        return;
    }
    const format = { ...params.format };

    format.type ??=
        isUrlData(params) && extractTypeFromUrl(withoutExprRef(params.url));
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
    /** @type {import("../../spec/channel.js").Scalar} */ x
) => ({ data: x });

const nopWrapper = (/** @type {import("../flowNode.js").Datum} */ x) => x;

/**
 * @param {import("../../spec/data.js").DataFormat} dataFormat
 * @return {dataFormat is import("../../spec/data.js").CsvDataFormat}
 */
export function isCsvDataFormat(dataFormat) {
    return dataFormat.type == "csv" || dataFormat.type == "tsv";
}

/**
 * @param {import("../../spec/data.js").DataFormat} dataFormat
 * @return {dataFormat is import("../../spec/data.js").DsvDataFormat}
 */
export function isDsvDataFormat(dataFormat) {
    return dataFormat.type == "dsv";
}

/**
 * @param {import("../../spec/data.js").DataFormat} dataFormat
 * @return {dataFormat is import("../../spec/data.js").JsonDataFormat}
 */
export function isJsonDataFormat(dataFormat) {
    return dataFormat.type == "json";
}

/**
 *
 * @param {import("../../spec/data.js").DataSource} dataSource
 * @return {dataSource is import("../../spec/data.js").UrlData}
 */
export function isUrlData(dataSource) {
    return "url" in dataSource;
}
