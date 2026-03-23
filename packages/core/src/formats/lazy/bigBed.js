import { registerBuiltInLazyDataSource } from "../../data/sources/lazyDataSourceRegistry.js";

import BigBedSource from "../../data/sources/lazy/bigBedSource.js";

/**
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../spec/data.js").BigBedData}
 */
function isBigBedSource(params) {
    return params?.type == "bigbed";
}

registerBuiltInLazyDataSource(isBigBedSource, BigBedSource);

export default BigBedSource;
