import InlineSource, { isInlineData } from "./inlineSource.js";
import UrlSource, { isUrlData } from "./urlSource.js";
import SequenceSource, { isSequenceGenerator } from "./sequenceSource.js";
import AxisTickSource from "./dynamic/axisTickSource.js";
import AxisGenomeSource from "./dynamic/axisGenomeSource.js";
import IndexedFastaSource from "./dynamic/indexedFastaSource.js";
import BigWigSource from "./dynamic/bigWigSource.js";
import BigBedSource from "./dynamic/bigBedSource.js";
import BamSource from "./dynamic/bamSource.js";
import Gff3Source from "./dynamic/gff3Source.js";

/**
 * @param {Partial<import("../../spec/data.js").Data>} params
 * @param {import("../../view/view.js").default} view
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
 * @param {Partial<import("../../spec/data.js").Data>} params
 * @returns {params is import("../../spec/data.js").LazyData}
 */
function isLazyData(params) {
    return "lazy" in params;
}

/**
 *
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../spec/data.js").AxisTicksData}
 */
function isAxisTickSource(params) {
    return params?.type == "axisTicks";
}

/**
 *
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../spec/data.js").AxisGenomeData}
 */
function isAxisGenomeSource(params) {
    return params?.type == "axisGenome";
}

/**
 *
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../spec/data.js").IndexedFastaData}
 */
function isIndexedFastaSource(params) {
    return params?.type == "indexedFasta";
}

/**
 *
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../spec/data.js").BigWigData}
 */
function isBigWigSource(params) {
    return params?.type == "bigwig";
}

/**
 *
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../spec/data.js").BigBedData}
 */
function isBigBedSource(params) {
    return params?.type == "bigbed";
}

/**
 *
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../spec/data.js").BamData}
 */
function isBamSource(params) {
    return params?.type == "bam";
}

/**
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../spec/data.js").Gff3Data}
 */
function isGff3Source(params) {
    return params?.type == "gff3";
}

/**
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @param {import("../../view/view.js").default} view
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
    } else if (isGff3Source(params)) {
        return new Gff3Source(params, view);
    }

    throw new Error(
        "Cannot figure out the data source type: " + JSON.stringify(params)
    );
}
