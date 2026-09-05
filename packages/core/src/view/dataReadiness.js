import Collector from "../data/collector.js";
import { isDataReady, iterateDataDependencies } from "../data/dataReadiness.js";
import SingleAxisLazySource from "../data/sources/lazy/singleAxisLazySource.js";
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
        if (!collector || !isDataReady(collector, readinessRequest)) {
            return false;
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
    for (const collector of collectSubtreeCollectors(subtreeRoot, viewFilter)) {
        const sources = Array.from(iterateDataDependencies(collector)).filter(
            (node) => node instanceof SingleAxisLazySource
        );
        // Keep the lazy-only contract for App waits: wholly eager branches
        // do not participate, but an eager primary with a lazy lookup does.
        if (
            sources.length &&
            (!isDataReady(collector) ||
                sources.some(
                    (source) => !isLazySourceReady(source, readinessRequest)
                ))
        ) {
            return false;
        }
    }

    return true;
}

/**
 * Waits until lazy data sources under the subtree satisfy the readiness request.
 * Non-lazy sources are ignored so they do not block readiness checks.
 *
 * @param {import("../types/viewContext.js").default} context
 * @param {View} subtreeRoot
 * @param {DataReadinessRequest | undefined} readinessRequest
 * @param {AbortSignal} [signal]
 * @param {(view: View) => boolean} [viewFilter]
 * @returns {Promise<void>}
 */
export function awaitSubtreeLazyReady(
    context,
    subtreeRoot,
    readinessRequest,
    signal,
    viewFilter
) {
    const shouldConsiderView = viewFilter ?? isEffectivelyVisible;

    return new Promise((resolve, reject) => {
        /** @type {Set<() => void>} */
        const unregisters = new Set();
        /** @type {Set<import("../data/collector.js").default>} */
        const observedCollectors = new Set();

        /** @type {(message: import("./view.js").BroadcastMessage) => void} */
        const broadcastListener = () => {
            attachCollectors();
            checkReady();
        };

        const cleanup = () => {
            for (const unregister of unregisters) {
                unregister();
            }
            unregisters.clear();
            context.removeBroadcastListener(
                "subtreeDataReady",
                broadcastListener
            );
            if (signal) {
                signal.removeEventListener("abort", abortHandler);
            }
        };

        const checkReady = () => {
            if (
                isSubtreeLazyReady(
                    subtreeRoot,
                    readinessRequest,
                    shouldConsiderView
                )
            ) {
                cleanup();
                resolve();
            }
        };

        const attachCollectors = () => {
            for (const output of collectSubtreeCollectors(
                subtreeRoot,
                shouldConsiderView
            )) {
                for (const node of iterateDataDependencies(output)) {
                    if (
                        node instanceof Collector &&
                        !observedCollectors.has(node)
                    ) {
                        observedCollectors.add(node);
                        unregisters.add(node.observe(checkReady));
                    }
                }
            }
        };

        const abortHandler = () => {
            cleanup();
            reject(new Error("Lazy subtree readiness was aborted."));
        };

        context.addBroadcastListener("subtreeDataReady", broadcastListener);

        if (signal) {
            if (signal.aborted) {
                abortHandler();
                return;
            }
            signal.addEventListener("abort", abortHandler, { once: true });
        }

        try {
            attachCollectors();
            requestUnavailableLazyData(
                subtreeRoot,
                readinessRequest,
                shouldConsiderView
            );
            checkReady();
        } catch (error) {
            cleanup();
            reject(error);
        }
    });
}

/**
 * @param {View} subtreeRoot
 * @param {(view: View) => boolean} [viewFilter]
 * @returns {Set<SingleAxisLazySource>}
 */
function collectLazyDataSources(subtreeRoot, viewFilter) {
    /** @type {Set<SingleAxisLazySource>} */
    const dataSources = new Set();
    for (const collector of collectSubtreeCollectors(subtreeRoot, viewFilter)) {
        for (const node of iterateDataDependencies(collector)) {
            if (node instanceof SingleAxisLazySource) {
                dataSources.add(node);
            }
        }
    }
    return dataSources;
}

/**
 * @param {View} subtreeRoot
 * @param {(view: View) => boolean} [viewFilter]
 * @returns {Set<Collector>}
 */
function collectSubtreeCollectors(subtreeRoot, viewFilter) {
    const shouldConsiderView = viewFilter ?? isEffectivelyVisible;
    /** @type {Set<Collector>} */
    const collectors = new Set();
    subtreeRoot.visit((view) => {
        if (
            view instanceof UnitView &&
            shouldConsiderView(view) &&
            view.flowHandle?.collector
        ) {
            collectors.add(view.flowHandle.collector);
        }
    });
    return collectors;
}

/**
 * Returns whether a view contributes visible pixels to the current render.
 *
 * @param {View} view
 * @returns {boolean}
 */
export function isEffectivelyVisible(view) {
    return view.isConfiguredVisible() && view.getEffectiveOpacity() > 0;
}

/**
 * @param {View} subtreeRoot
 * @param {DataReadinessRequest | undefined} readinessRequest
 * @param {(view: View) => boolean} viewFilter
 */
function requestUnavailableLazyData(subtreeRoot, readinessRequest, viewFilter) {
    for (const dataSource of collectLazyDataSources(subtreeRoot, viewFilter)) {
        const domain = getLazySourceReadinessDomain(
            dataSource,
            readinessRequest
        );
        if (domain) {
            dataSource.ensureDataForDomain(domain);
        }
    }
}

/**
 * @param {SingleAxisLazySource} dataSource
 * @param {DataReadinessRequest | undefined} readinessRequest
 */
function isLazySourceReady(dataSource, readinessRequest) {
    const domain = getLazySourceReadinessDomain(dataSource, readinessRequest);

    return (
        !!domain &&
        dataSource.isDataReadyForDomain({
            [dataSource.channel]: domain,
        })
    );
}

/**
 * @param {SingleAxisLazySource} dataSource
 * @param {DataReadinessRequest | undefined} readinessRequest
 * @returns {number[] | undefined}
 */
function getLazySourceReadinessDomain(dataSource, readinessRequest) {
    return (
        readinessRequest?.[dataSource.channel] ??
        (!readinessRequest
            ? Array.from(dataSource.scaleResolution.getDomain())
            : undefined)
    );
}
