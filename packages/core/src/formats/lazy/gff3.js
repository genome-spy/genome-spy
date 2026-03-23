import { registerBuiltInLazyDataSource } from "../../data/sources/lazyDataSourceRegistry.js";

import Gff3Source from "../../data/sources/lazy/gff3Source.js";

/**
 * @param {import("../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../spec/data.js").Gff3Data}
 */
function isGff3Source(params) {
    return params?.type == "gff3";
}

registerBuiltInLazyDataSource(isGff3Source, Gff3Source);

export default Gff3Source;
