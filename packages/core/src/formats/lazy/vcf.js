import { registerBuiltInLazyDataSource } from "../../data/sources/lazyDataSourceRegistry.js";

import VcfSource from "../../data/sources/lazy/vcfSource.js";

/**
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../spec/data.js").VcfData}
 */
function isVcfSource(params) {
    return params?.type == "vcf";
}

registerBuiltInLazyDataSource(isVcfSource, VcfSource);

export default VcfSource;
