import InlineSource, { isInlineData } from "./inlineSource.js";
import UrlSource, { isUrlData } from "./urlSource.js";
import SequenceSource, { isSequenceGenerator } from "./sequenceSource.js";
import AxisTickSource from "./lazy/axisTickSource.js";
import AxisGenomeSource from "./lazy/axisGenomeSource.js";
import IndexedFastaSource from "./lazy/indexedFastaSource.js";
import BigWigSource from "./lazy/bigWigSource.js";
import BigBedSource from "./lazy/bigBedSource.js";
import BamSource from "./lazy/bamSource.js";
import Gff3Source from "./lazy/gff3Source.js";
import VcfSource from "./lazy/vcfSource.js";

/**
 * @template {import("../../spec/data.js").LazyDataParams} P
 * @typedef {{
 *   guard: (params: import("../../spec/data.js").LazyDataParams) => params is P,
 *   Source: new (params: P, view: import("../../view/view.js").default) => import("./dataSource.js").default
 * }} LazySourceEntry
 */

/** @type {LazySourceEntry<any>[]} */
const customLazySources = [];

/**
 * Registers a lazy data source for a custom type.
 *
 * @template {import("../../spec/data.js").LazyDataParams} P
 * @param {LazySourceEntry<P>["guard"]} guard
 * @param {LazySourceEntry<P>["Source"]} Source
 * @returns {() => void}
 */
export function registerLazyDataSource(guard, Source) {
    /** @type {LazySourceEntry<any>} */
    const entry = { guard, Source };
    customLazySources.push(entry);
    return () => {
        const index = customLazySources.indexOf(entry);
        if (index >= 0) {
            customLazySources.splice(index, 1);
        }
    };
}

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
        return createLazyDataSource(params.lazy, view);
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
 * @returns {params is import("../../spec/data.js").VcfData}
 */
function isVcfSource(params) {
    return params?.type == "vcf";
}

/** @type {LazySourceEntry<any>[]} */
const builtinLazySources = [
    { guard: isAxisTickSource, Source: AxisTickSource },
    { guard: isAxisGenomeSource, Source: AxisGenomeSource },
    { guard: isIndexedFastaSource, Source: IndexedFastaSource },
    { guard: isBigWigSource, Source: BigWigSource },
    { guard: isBigBedSource, Source: BigBedSource },
    { guard: isBamSource, Source: BamSource },
    { guard: isGff3Source, Source: Gff3Source },
    { guard: isVcfSource, Source: VcfSource },
];

/**
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @param {import("../../view/view.js").default} view
 */
function createLazyDataSource(params, view) {
    for (const entry of customLazySources) {
        if (entry.guard(params)) {
            return new entry.Source(/** @type {any} */ (params), view);
        }
    }
    for (const entry of builtinLazySources) {
        if (entry.guard(params)) {
            return new entry.Source(/** @type {any} */ (params), view);
        }
    }

    throw new Error(
        "Cannot figure out the data source type: " + JSON.stringify(params)
    );
}
