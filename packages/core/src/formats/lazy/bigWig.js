import { registerBuiltInLazyDataSource } from "../../data/sources/lazyDataSourceRegistry.js";

import BigWigSource from "../../data/sources/lazy/bigWigSource.js";

/**
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../spec/data.js").BigWigData}
 */
function isBigWigSource(params) {
    return params?.type == "bigwig";
}

registerBuiltInLazyDataSource(isBigWigSource, BigWigSource);

export default BigWigSource;
