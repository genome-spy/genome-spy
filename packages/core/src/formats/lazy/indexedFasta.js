import { registerBuiltInLazyDataSource } from "../../data/sources/lazyDataSourceRegistry.js";

import IndexedFastaSource from "../../data/sources/lazy/indexedFastaSource.js";

/**
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../spec/data.js").IndexedFastaData}
 */
function isIndexedFastaSource(params) {
    return params?.type == "indexedFasta";
}

registerBuiltInLazyDataSource(isIndexedFastaSource, IndexedFastaSource);

export default IndexedFastaSource;
