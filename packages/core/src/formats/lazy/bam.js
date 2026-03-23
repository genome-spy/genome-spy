import { registerBuiltInLazyDataSource } from "../../data/sources/lazyDataSourceRegistry.js";

import BamSource from "../../data/sources/lazy/bamSource.js";

/**
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../spec/data.js").BamData}
 */
function isBamSource(params) {
    return params?.type == "bam";
}

registerBuiltInLazyDataSource(isBamSource, BamSource);

export default BamSource;
