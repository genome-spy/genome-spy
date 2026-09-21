import { viewQueryResolvers } from "./view/viewQueryAccess.js";
import { describeView, readViewData } from "./view/viewDataApi.js";

/** @typedef {import("./types/viewQueryApi.js").ViewQueryApi} ViewQueryApi */
/** @typedef {import("./types/viewQueryApi.js").ViewDescription} ViewDescription */
/** @typedef {import("./types/viewQueryApi.js").ViewDataReadOptions} ViewDataReadOptions */
/** @typedef {import("./types/viewQueryApi.js").ViewDataReadResult} ViewDataReadResult */

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
        describe: (address) => describeView(resolve(address)),
        readData: (address, options) => readViewData(resolve(address), options),
    };
}
