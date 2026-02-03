import DataSource from "../data/sources/dataSource.js";
import UnitView from "./unitView.js";

/**
 * @typedef {import("../view/view.js").default} View
 * @typedef {import("../data/sources/lazy/singleAxisLazySource.js").DataReadinessRequest} DataReadinessRequest
 */

/**
 * Builds a readiness request for the provided channels.
 *
 * @param {View} view
 * @param {import("../spec/channel.js").PrimaryPositionalChannel[]} channels
 * @returns {DataReadinessRequest | undefined}
 */
export function buildReadinessRequest(view, channels) {
    /** @type {DataReadinessRequest} */
    const request = {};

    for (const channel of channels) {
        const resolution = view.getScaleResolution(channel);
        if (!resolution) {
            continue;
        }
        request[channel] = Array.from(resolution.getDomain());
    }

    return Object.keys(request).length ? request : undefined;
}

/**
 * Checks whether all data sources under the subtree report readiness.
 *
 * @param {View} subtreeRoot
 * @param {DataReadinessRequest} readinessRequest
 * @param {(view: View) => boolean} [viewFilter]
 * @returns {boolean}
 */
export function isSubtreeReady(subtreeRoot, readinessRequest, viewFilter) {
    const shouldConsiderView =
        viewFilter ??
        ((/** @type {View} */ view) => view.isConfiguredVisible());

    const unitViews = subtreeRoot
        .getDescendants()
        .filter((view) => view instanceof UnitView && shouldConsiderView(view));

    if (unitViews.length === 0) {
        return subtreeRoot.isDataInitialized();
    }

    for (const view of unitViews) {
        /** @type {import("../data/collector.js").default | undefined} */
        const collector = view.flowHandle?.collector;
        if (!collector || !collector.completed) {
            return false;
        }

        /** @type {import("../data/flowNode.js").default | undefined} */
        let node = collector;
        while (node && !(node instanceof DataSource)) {
            node = node.parent;
        }

        const dataSource = /** @type {DataSource | undefined} */ (node);
        if (!dataSource) {
            return false;
        }

        if ("isDataReadyForDomain" in dataSource) {
            // It's available in SingleAxisLazySource and its subclasses
            const checkableSource =
                /** @type {import("../data/sources/lazy/singleAxisLazySource.js").DataReadinessCheckable} */ (
                    dataSource
                );
            if (
                !readinessRequest ||
                !checkableSource.isDataReadyForDomain(readinessRequest)
            ) {
                return false;
            }
        }
    }

    return true;
}

/**
 * Checks readiness for lazy data sources under the subtree. Non-lazy sources
 * are ignored so they do not block readiness checks.
 *
 * @param {View} subtreeRoot
 * @param {DataReadinessRequest | undefined} readinessRequest
 * @param {(view: View) => boolean} [viewFilter]
 * @returns {boolean}
 */
export function isSubtreeLazyReady(subtreeRoot, readinessRequest, viewFilter) {
    const shouldConsiderView =
        viewFilter ??
        ((/** @type {View} */ view) => view.isConfiguredVisible());

    /** @type {Set<DataSource>} */
    const dataSources = new Set();

    subtreeRoot.visit((view) => {
        if (!(view instanceof UnitView)) {
            return;
        }
        if (!shouldConsiderView(view)) {
            return;
        }

        /** @type {View | null} */
        let current = view;
        while (current) {
            if (current.flowHandle && current.flowHandle.dataSource) {
                break;
            }
            current = current.dataParent;
        }

        if (!current || !current.flowHandle) {
            return;
        }
        const dataSource = current.flowHandle.dataSource;
        if (!("isDataReadyForDomain" in dataSource)) {
            return;
        }
        dataSources.add(dataSource);
    });

    if (!dataSources.size) {
        return true;
    }

    if (!readinessRequest) {
        return false;
    }

    for (const dataSource of dataSources) {
        const checkReady =
            /** @type {import("../data/sources/lazy/singleAxisLazySource.js").DataReadinessCheckable["isDataReadyForDomain"]} */ (
                /** @type {any} */ (dataSource).isDataReadyForDomain
            );
        if (!checkReady.call(dataSource, readinessRequest)) {
            return false;
        }
    }

    return true;
}
