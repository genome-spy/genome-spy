import { registerBuiltInLazyDataSource } from "../../data/sources/lazyDataSourceRegistry.js";

import AxisTickSource from "../../data/sources/lazy/axisTickSource.js";

/**
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../spec/data.js").AxisTicksData}
 */
function isAxisTickSource(params) {
    return params?.type == "axisTicks";
}

registerBuiltInLazyDataSource(isAxisTickSource, AxisTickSource);

export default AxisTickSource;
