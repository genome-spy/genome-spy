import InlineSource, { isInlineData } from "./inlineSource";
import UrlSource, { isUrlData } from "./urlSource";
import SequenceSource, { isSequenceGenerator } from "./sequenceSource";

/**
 * @param {Partial<import("../../spec/data").Data>} params
 * @param {import("../../view/view").default} view
 */
export default function createDataSource(params, view) {
    if (isInlineData(params)) {
        return new InlineSource(params, view);
    } else if (isUrlData(params)) {
        return new UrlSource(params, view);
    } else if (isSequenceGenerator(params)) {
        return new SequenceSource(params, view);
    }

    throw new Error(
        "Cannot figure out the data source type: " + JSON.stringify(params)
    );
}
