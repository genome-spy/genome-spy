import InlineSource, { isInlineData } from "./inlineSource";
import UrlSource, { isUrlData } from "./urlSource";
import SequenceSource, { isSequenceGenerator } from "./sequenceSource";

/**
 * @param {Partial<import("../../spec/data").Data>} params
 * @param {string} [baseUrl]
 */
export default function createDataSource(params, baseUrl) {
    if (isInlineData(params)) {
        return new InlineSource(params);
    } else if (isUrlData(params)) {
        return new UrlSource(params, baseUrl);
    } else if (isSequenceGenerator(params)) {
        return new SequenceSource(params);
    }

    throw new Error(
        "Cannot figure out the data source type: " + JSON.stringify(params)
    );
}
