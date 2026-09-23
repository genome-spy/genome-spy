import { queryViewData, assessViewQuery } from "./view/viewSliceQuery.js";
import { viewQueryResolvers } from "./view/viewQueryAccess.js";
import { describeView, readViewData } from "./view/viewDataApi.js";

/** @typedef {import("./types/viewQueryApi.js").ViewQueryApi} ViewQueryApi */
/** @typedef {import("./types/viewQueryApi.js").ViewQueryScopeOptions} ViewQueryScopeOptions */
/** @typedef {import("./types/viewQueryApi.js").ViewQueryAssessment} ViewQueryAssessment */
/** @typedef {import("./types/viewQueryApi.js").QuerySupportReason} QuerySupportReason */
/** @typedef {import("./types/viewQueryApi.js").ViewDescription} ViewDescription */
/** @typedef {import("./types/viewQueryApi.js").ViewDataReadOptions} ViewDataReadOptions */
/** @typedef {import("./types/viewQueryApi.js").ViewDataReadResult} ViewDataReadResult */

/** @typedef {import("./types/viewQueryApi.js").ViewSliceQueryOptions} ViewSliceQueryOptions */
/** @typedef {import("./types/viewQueryApi.js").ViewSliceQueryResult} ViewSliceQueryResult */
/** @typedef {import("./types/viewQueryApi.js").ViewSliceAggregate} ViewSliceAggregate */

/**
 * Creates optional data inspection for a view API from the same Core module instance.
 * Addresses are resolved on each call; no internal views escape this boundary.
 * @param {import("./types/embedApi.js").ViewApi} views
 * @returns {ViewQueryApi}
 */
export function createViewQuery(views) {
    const resolve = viewQueryResolvers.get(views);
    if (!resolve) {
        throw new Error(
            "Unrecognized view API. Import Core and @genome-spy/core/view-query from the same module instance; do not mix standalone bundles."
        );
    }

    return {
        assessQuery: (address, options) =>
            assessViewQuery(resolve(address), options),
        describe: (address) => describeView(resolve(address)),
        readData: (address, options) => readViewData(resolve(address), options),
        queryData: (address, options) =>
            queryViewData(() => resolve(address), options),
    };
}
