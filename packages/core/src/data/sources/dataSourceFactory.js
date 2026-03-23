import InlineSource, { isInlineData } from "./inlineSource.js";
import UrlSource, { isUrlData } from "./urlSource.js";
import SequenceSource, { isSequenceGenerator } from "./sequenceSource.js";
import "./lazy/registerBuiltInLazySources.js";
import {
    createLazyDataSource,
    registerLazyDataSource,
} from "./lazy/lazyDataSourceRegistry.js";

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

export { registerLazyDataSource };
