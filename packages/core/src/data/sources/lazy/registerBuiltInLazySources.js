import { registerBuiltInLazyDataSource } from "../lazyDataSourceRegistry.js";

import AxisTickSource from "./axisTickSource.js";
import AxisGenomeSource from "./axisGenomeSource.js";
import IndexedFastaSource from "./indexedFastaSource.js";
import BigWigSource from "./bigWigSource.js";
import BigBedSource from "./bigBedSource.js";
import BamSource from "./bamSource.js";
import Gff3Source from "./gff3Source.js";
import VcfSource from "./vcfSource.js";

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").AxisTicksData}
 */
function isAxisTickSource(params) {
    return params?.type == "axisTicks";
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").AxisGenomeData}
 */
function isAxisGenomeSource(params) {
    return params?.type == "axisGenome";
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").IndexedFastaData}
 */
function isIndexedFastaSource(params) {
    return params?.type == "indexedFasta";
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").BigWigData}
 */
function isBigWigSource(params) {
    return params?.type == "bigwig";
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").BigBedData}
 */
function isBigBedSource(params) {
    return params?.type == "bigbed";
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").BamData}
 */
function isBamSource(params) {
    return params?.type == "bam";
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").Gff3Data}
 */
function isGff3Source(params) {
    return params?.type == "gff3";
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").VcfData}
 */
function isVcfSource(params) {
    return params?.type == "vcf";
}

registerBuiltInLazyDataSource(isAxisTickSource, AxisTickSource);
registerBuiltInLazyDataSource(isAxisGenomeSource, AxisGenomeSource);
registerBuiltInLazyDataSource(isIndexedFastaSource, IndexedFastaSource);
registerBuiltInLazyDataSource(isBigWigSource, BigWigSource);
registerBuiltInLazyDataSource(isBigBedSource, BigBedSource);
registerBuiltInLazyDataSource(isBamSource, BamSource);
registerBuiltInLazyDataSource(isGff3Source, Gff3Source);
registerBuiltInLazyDataSource(isVcfSource, VcfSource);
