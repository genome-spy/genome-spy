import InlineSource, { isInlineData } from "./inlineSource";
import UrlSource, { isUrlData } from "./urlSource";
import SequenceSource, { isSequenceGenerator } from "./sequenceSource";
import AxisTickSource from "./dynamic/axisTickSource";
import AxisGenomeSource from "./dynamic/axisGenomeSource";
import IndexedFastaSource from "./dynamic/indexedFastaSource";
import BigWigSource from "./dynamic/bigWigSource";
import BigBedSource from "./dynamic/bigBedSource";
import BamSource from "./dynamic/bamSource";

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
 * @returns {params is import("../../spec/data").AxisTicksData}
 */
function isAxisTickSource(params) {
    return params?.type == "axisTicks";
}

/**
 *
 * @param {import("../../spec/data").DynamicDataParams} params
 * @returns {params is import("../../spec/data").AxisGenomeData}
 */
function isAxisGenomeSource(params) {
    return params?.type == "axisGenome";
}

/**
 *
 * @param {import("../../spec/data").DynamicDataParams} params
 * @returns {params is import("../../spec/data").IndexedFastaData}
 */
function isIndexedFastaSource(params) {
    return params?.type == "indexedFasta";
}

/**
 *
 * @param {import("../../spec/data").DynamicDataParams} params
 * @returns {params is import("../../spec/data").BigWigData}
 */
function isBigWigSource(params) {
    return params?.type == "bigwig";
}

/**
 *
 * @param {import("../../spec/data").DynamicDataParams} params
 * @returns {params is import("../../spec/data").BigBedData}
 */
function isBigBedSource(params) {
    return params?.type == "bigbed";
}

/**
 *
 * @param {import("../../spec/data").DynamicDataParams} params
 * @returns {params is import("../../spec/data").BamData}
 */
function isBamSource(params) {
    return params?.type == "bam";
}

/**
 * @param {import("../../spec/data").DynamicDataParams} params
 * @param {import("../../view/view").default} view
 */
function createDynamicDataSource(params, view) {
    if (isAxisTickSource(params)) {
        return new AxisTickSource(params, view);
    } else if (isAxisGenomeSource(params)) {
        return new AxisGenomeSource(params, view);
    } else if (isIndexedFastaSource(params)) {
        return new IndexedFastaSource(params, view);
    } else if (isBigWigSource(params)) {
        return new BigWigSource(params, view);
    } else if (isBigBedSource(params)) {
        return new BigBedSource(params, view);
    } else if (isBamSource(params)) {
        return new BamSource(params, view);
    }

    throw new Error(
        "Cannot figure out the data source type: " + JSON.stringify(params)
    );
}
