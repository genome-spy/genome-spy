import InlineSource, { isInlineData } from "./inlineSource";
import UrlSource, { isUrlData } from "./urlSource";
import SequenceSource, { isSequenceGenerator } from "./sequenceSource";
import AxisTickSource from "./dynamic/axisTickSource";
import AxisGenomeSource from "./dynamic/axisGenomeSource";
import IndexedFastaSource from "./dynamic/indexedFastaSource";
import BigWigSource from "./dynamic/bigWigSource";
import BigBedSource from "./dynamic/bigBedSource";
import BamSource from "./dynamic/bamSource";
import TabixSource from "./dynamic/tabixSource";

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
    } else if (isLazyData(params)) {
        return createDynamicDataSource(params.lazy, view);
    }

    throw new Error(
        "Cannot figure out the data source type: " + JSON.stringify(params)
    );
}

/**
 *
 * @param {Partial<import("../../spec/data").Data>} params
 * @returns {params is import("../../spec/data").LazyData}
 */
function isLazyData(params) {
    return "lazy" in params;
}

/**
 *
 * @param {import("../../spec/data").LazyDataParams} params
 * @returns {params is import("../../spec/data").AxisTicksData}
 */
function isAxisTickSource(params) {
    return params?.type == "axisTicks";
}

/**
 *
 * @param {import("../../spec/data").LazyDataParams} params
 * @returns {params is import("../../spec/data").AxisGenomeData}
 */
function isAxisGenomeSource(params) {
    return params?.type == "axisGenome";
}

/**
 *
 * @param {import("../../spec/data").LazyDataParams} params
 * @returns {params is import("../../spec/data").IndexedFastaData}
 */
function isIndexedFastaSource(params) {
    return params?.type == "indexedFasta";
}

/**
 *
 * @param {import("../../spec/data").LazyDataParams} params
 * @returns {params is import("../../spec/data").BigWigData}
 */
function isBigWigSource(params) {
    return params?.type == "bigwig";
}

/**
 *
 * @param {import("../../spec/data").LazyDataParams} params
 * @returns {params is import("../../spec/data").BigBedData}
 */
function isBigBedSource(params) {
    return params?.type == "bigbed";
}

/**
 *
 * @param {import("../../spec/data").LazyDataParams} params
 * @returns {params is import("../../spec/data").BamData}
 */
function isBamSource(params) {
    return params?.type == "bam";
}

/**
 * @param {import("../../spec/data").LazyDataParams} params
 * @returns {params is import("../../spec/data").TabixData}
 */
function isTabixSource(params) {
    return params?.type == "tabix";
}

/**
 * @param {import("../../spec/data").LazyDataParams} params
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
    } else if (isTabixSource(params)) {
        return new TabixSource(params, view);
    }

    throw new Error(
        "Cannot figure out the data source type: " + JSON.stringify(params)
    );
}
