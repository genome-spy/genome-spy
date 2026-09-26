import ViewAnnotations, { assessAnnotations } from "./view/viewAnnotations.js";
import { queryViewData, assessViewQuery } from "./view/viewSliceQuery.js";
import { viewQueryResolvers } from "./view/viewQueryAccess.js";
import { describeView, readViewData } from "./view/viewDataApi.js";

/** @type {WeakMap<import("./types/embedApi.js").ViewApi, ViewAnnotations>} */
const annotationControllers = new WeakMap();

/** @typedef {import("./types/viewQueryApi.js").ViewQueryApi} ViewQueryApi */
/** @typedef {import("./types/viewQueryApi.js").ViewAnnotationAssessment} ViewAnnotationAssessment */
/** @typedef {import("./types/viewQueryApi.js").ViewAnnotationSet} ViewAnnotationSet */
/** @typedef {import("./types/viewQueryApi.js").ViewAnnotationState} ViewAnnotationState */
/** @typedef {import("./types/viewQueryApi.js").ViewQueryScopeOptions} ViewQueryScopeOptions */
/** @typedef {import("./types/viewQueryApi.js").ViewQueryAssessment} ViewQueryAssessment */
/** @typedef {import("./types/viewQueryApi.js").QuerySupportReason} QuerySupportReason */
/** @typedef {import("./types/viewQueryApi.js").ViewDescription} ViewDescription */
/** @typedef {import("./types/viewQueryApi.js").ViewDataReadOptions} ViewDataReadOptions */
/** @typedef {import("./types/viewQueryApi.js").ViewDataReadResult} ViewDataReadResult */

/** @typedef {import("./types/viewQueryApi.js").ViewSliceQueryOptions} ViewSliceQueryOptions */
/** @typedef {import("./types/viewQueryApi.js").ViewSliceQueryResult} ViewSliceQueryResult */
/** @typedef {import("./types/viewQueryApi.js").ViewSliceAnalysisStage} ViewSliceAnalysisStage */
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

    let annotations = annotationControllers.get(views);
    if (!annotations || annotations.disposed) {
        annotations = new ViewAnnotations(resolve);
        annotationControllers.set(views, annotations);
    }
    return {
        annotations,
        assessAnnotations: (address) => assessAnnotations(resolve(address)),
        assessQuery: (address, options) =>
            assessViewQuery(resolve(address), options),
        describe: (address) => describeView(resolve(address)),
        readData: (address, options) => readViewData(resolve(address), options),
        queryData: (address, options) =>
            queryViewData(
                () => resolve(address),
                options,
                (view, rows) => annotations.capture(view, rows)
            ),
    };
}
