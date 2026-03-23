import { registerBuiltInLazyDataSource } from "../../data/sources/lazyDataSourceRegistry.js";

import AxisGenomeSource from "../../data/sources/lazy/axisGenomeSource.js";

/**
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../spec/data.js").AxisGenomeData}
 */
function isAxisGenomeSource(params) {
    return params?.type == "axisGenome";
}

registerBuiltInLazyDataSource(isAxisGenomeSource, AxisGenomeSource);

export default AxisGenomeSource;
