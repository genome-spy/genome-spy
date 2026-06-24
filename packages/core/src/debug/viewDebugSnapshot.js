import ContainerView from "../view/containerView.js";
import { getViewSelector, isChromeView } from "../view/viewSelectors.js";

/**
 * @typedef {object} ViewDebugSnapshotOptions
 * @prop {boolean} [includeChrome=false]
 * @prop {(object: object) => string} getDebugId
 */

/**
 * @typedef {object} ViewDebugNode
 * @prop {string} id
 * @prop {string | undefined} parentId
 * @prop {string[]} childIds
 * @prop {string} name
 * @prop {string | undefined} explicitName
 * @prop {string | undefined} defaultName
 * @prop {string} path
 * @prop {string} className
 * @prop {string} type
 * @prop {string | undefined} markType
 * @prop {boolean} chrome
 * @prop {boolean} visible
 * @prop {boolean} configuredVisible
 * @prop {boolean} visibleInSpec
 * @prop {"none" | "pending" | "ready"} dataInitializationState
 * @prop {import("../view/viewUtilTypes.d.ts").ViewSelector | undefined} selector
 * @prop {{ x: number, y: number, width: number, height: number } | undefined} bounds
 * @prop {{ width: any, height: any } | undefined} size
 * @prop {{ width: any, height: any } | undefined} viewportSize
 * @prop {Record<string, string>} scaleResolutionIds
 * @prop {Record<string, string>} axisResolutionIds
 * @prop {Record<string, string>} legendResolutionIds
 * @prop {string[]} paramNames
 * @prop {Record<string, any>} spec
 */

/**
 * @typedef {object} ViewDebugSnapshot
 * @prop {string | undefined} rootId
 * @prop {ViewDebugNode[]} nodes
 */

/**
 * Creates a plain, read-only debug snapshot of the live view hierarchy.
 *
 * This module is intended for dynamic import by optional development tools.
 * Keep the returned shape serializable and avoid exposing mutable runtime
 * collections directly.
 *
 * @param {import("../view/view.js").default | undefined} root
 * @param {ViewDebugSnapshotOptions} options
 * @returns {ViewDebugSnapshot}
 */
export function createViewDebugSnapshot(root, options) {
    if (!root) {
        return {
            rootId: undefined,
            nodes: [],
        };
    }

    const includeChrome = options.includeChrome ?? false;
    /** @type {ViewDebugNode[]} */
    const nodes = [];

    /**
     * @param {import("../view/view.js").default} view
     * @param {string | undefined} parentId
     * @returns {ViewDebugNode | undefined}
     */
    const visit = (view, parentId) => {
        const chrome = isChromeView(view);
        if (chrome && !includeChrome) {
            return undefined;
        }

        const id = options.getDebugId(view);
        const node = createViewDebugNode(view, id, parentId, chrome, options);
        nodes.push(node);

        if (view instanceof ContainerView) {
            for (const child of view) {
                const childNode = visit(child, id);
                if (childNode) {
                    node.childIds.push(childNode.id);
                }
            }
        }

        return node;
    };

    const rootNode = visit(root, undefined);

    return {
        rootId: rootNode?.id,
        nodes,
    };
}

/**
 * @param {import("../view/view.js").default} view
 * @param {string} id
 * @param {string | undefined} parentId
 * @param {boolean} chrome
 * @param {ViewDebugSnapshotOptions} options
 * @returns {ViewDebugNode}
 */
function createViewDebugNode(view, id, parentId, chrome, options) {
    return {
        id,
        parentId,
        childIds: [],
        name: view.name,
        explicitName: view.explicitName,
        defaultName: view.defaultName,
        path: view.getPathString(),
        className: view.constructor.name,
        type: getViewType(view),
        markType: getMarkType(view),
        chrome,
        visible: view.isVisible(),
        configuredVisible: view.isConfiguredVisible(),
        visibleInSpec: view.isVisibleInSpec(),
        dataInitializationState: view.getDataInitializationState(),
        selector: getSelector(view),
        bounds: getBounds(view),
        size: summarizeFlexDimensions(view.getSize()),
        viewportSize: summarizeFlexDimensions(view.getViewportSize()),
        scaleResolutionIds: getResolutionIds(view.resolutions.scale, options),
        axisResolutionIds: getResolutionIds(view.resolutions.axis, options),
        legendResolutionIds: getResolutionIds(view.resolutions.legend, options),
        paramNames: Array.from(view.paramRuntime.paramConfigs.keys()),
        spec: structuredClone(view.spec),
    };
}

/**
 * @param {import("../view/view.js").default} view
 * @returns {string}
 */
function getViewType(view) {
    if (typeof (/** @type {any} */ (view).getMarkType) === "function") {
        return "unit";
    }

    const className = view.constructor.name;
    return className.endsWith("View")
        ? className.slice(0, -4).toLowerCase()
        : className.toLowerCase();
}

/**
 * @param {import("../view/view.js").default} view
 * @returns {string | undefined}
 */
function getMarkType(view) {
    const unitView = /** @type {{ getMarkType?: () => string }} */ (
        /** @type {unknown} */ (view)
    );
    if (typeof unitView.getMarkType === "function") {
        return unitView.getMarkType();
    }
}

/**
 * @param {import("../view/view.js").default} view
 * @returns {import("../view/viewUtilTypes.d.ts").ViewSelector | undefined}
 */
function getSelector(view) {
    if (!view.explicitName) {
        return undefined;
    }

    return getViewSelector(view);
}

/**
 * @param {import("../view/view.js").default} view
 * @returns {{ x: number, y: number, width: number, height: number } | undefined}
 */
function getBounds(view) {
    const coords = view.coords;
    if (!coords) {
        return undefined;
    }

    return {
        x: coords.x,
        y: coords.y,
        width: coords.width,
        height: coords.height,
    };
}

/**
 * @param {import("../view/layout/flexLayout.js").FlexDimensions} dimensions
 * @returns {{ width: any, height: any }}
 */
function summarizeFlexDimensions(dimensions) {
    return {
        width: dimensions.width,
        height: dimensions.height,
    };
}

/**
 * @param {Record<string, any>} resolutions
 * @param {ViewDebugSnapshotOptions} options
 * @returns {Record<string, string>}
 */
function getResolutionIds(resolutions, options) {
    /** @type {Record<string, string>} */
    const ids = {};

    for (const [channel, resolution] of Object.entries(resolutions)) {
        if (resolution) {
            ids[channel] = options.getDebugId(
                /** @type {object} */ (resolution)
            );
        }
    }

    return ids;
}
