import InlineSource, { isInlineData } from "./inlineSource";
import UrlSource, { isUrlData } from "./urlSource";
import SequenceSource, { isSequenceGenerator } from "./sequenceSource";
import AxisTickSource from "./dynamic/axisTickSource";

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
    } else if (isDynamicData(params)) {
        return createDynamicDataSource(params.dynamic, view);
    }

    throw new Error(
        "Cannot figure out the data source type: " + JSON.stringify(params)
    );
}

/**
 *
 * @param {Partial<import("../../spec/data").Data>} params
 * @returns {params is import("../../spec/data").DynamicData}
 */
function isDynamicData(params) {
    return "dynamic" in params;
}

/**
 *
 * @param {import("../../spec/data").DynamicDataParams} params
 */
function isAxisTickSource(params) {
    return params?.type == "axisTicks";
}

/**
 * @param {import("../../spec/data").DynamicDataParams} params
 * @param {import("../../view/view").default} view
 */
function createDynamicDataSource(params, view) {
    if (isAxisTickSource(params)) {
        return new AxisTickSource(params, view);
    }

    throw new Error(
        "Cannot figure out the data source type: " + JSON.stringify(params)
    );
}
