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
 * @prop {Record<string, EncodingDebugNode>} encodings
 * @prop {string[]} paramNames
 * @prop {Record<string, any>} spec
 * @prop {DebugSnapshotError[]} debugErrors
 */

/**
 * @typedef {object} DebugSnapshotError
 * @prop {string} field
 * @prop {string} message
 */

/**
 * @typedef {object} EncodingDebugNode
 * @prop {string} channel
 * @prop {string | undefined} field
 * @prop {string | undefined} expr
 * @prop {any} value
 * @prop {string | undefined} type
 * @prop {string | undefined} scaleResolutionId
 * @prop {string | undefined} axisResolutionId
 * @prop {string | undefined} legendResolutionId
 * @prop {Record<string, any>} channelDef
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
    /** @type {DebugSnapshotError[]} */
    const debugErrors = [];
    return {
        id,
        parentId,
        childIds: [],
        name: view.name,
        explicitName: view.explicitName,
        defaultName: view.defaultName,
        path: captureDebugValue(debugErrors, "path", view.name, () =>
            view.getPathString()
        ),
        className: view.constructor.name,
        type: captureDebugValue(debugErrors, "type", "unknown", () =>
            getViewType(view)
        ),
        markType: captureDebugValue(debugErrors, "markType", undefined, () =>
            getMarkType(view)
        ),
        chrome,
        visible: captureDebugValue(debugErrors, "visible", false, () =>
            view.isVisible()
        ),
        configuredVisible: captureDebugValue(
            debugErrors,
            "configuredVisible",
            false,
            () => view.isConfiguredVisible()
        ),
        visibleInSpec: captureDebugValue(
            debugErrors,
            "visibleInSpec",
            false,
            () => view.isVisibleInSpec()
        ),
        dataInitializationState: captureDebugValue(
            debugErrors,
            "dataInitializationState",
            "none",
            () => view.getDataInitializationState()
        ),
        selector: captureDebugValue(debugErrors, "selector", undefined, () =>
            getSelector(view)
        ),
        bounds: captureDebugValue(debugErrors, "bounds", undefined, () =>
            getBounds(view)
        ),
        size: captureDebugValue(debugErrors, "size", undefined, () =>
            summarizeFlexDimensions(view.getSize())
        ),
        viewportSize: captureDebugValue(
            debugErrors,
            "viewportSize",
            undefined,
            () => summarizeFlexDimensions(view.getViewportSize())
        ),
        scaleResolutionIds: captureDebugValue(
            debugErrors,
            "scaleResolutionIds",
            {},
            () => getResolutionIds(view.resolutions.scale, options)
        ),
        axisResolutionIds: captureDebugValue(
            debugErrors,
            "axisResolutionIds",
            {},
            () => getResolutionIds(view.resolutions.axis, options)
        ),
        legendResolutionIds: captureDebugValue(
            debugErrors,
            "legendResolutionIds",
            {},
            () => getResolutionIds(view.resolutions.legend, options)
        ),
        encodings: captureDebugValue(debugErrors, "encodings", {}, () =>
            getEncodings(view, options)
        ),
        paramNames: captureDebugValue(debugErrors, "paramNames", [], () =>
            Array.from(view.paramRuntime.paramConfigs.keys())
        ),
        spec: captureDebugValue(
            debugErrors,
            "spec",
            /** @type {import("../spec/view.js").ViewSpec} */ ({}),
            () => structuredClone(view.spec)
        ),
        debugErrors,
    };
}

/**
 * @template T
 * @param {DebugSnapshotError[]} debugErrors
 * @param {string} field
 * @param {T} fallback
 * @param {() => T} getter
 * @returns {T}
 */
function captureDebugValue(debugErrors, field, fallback, getter) {
    try {
        return getter();
    } catch (error) {
        console.warn(`Failed to collect view debug field "${field}".`, error);
        debugErrors.push({
            field,
            message: error instanceof Error ? error.message : String(error),
        });
        return fallback;
    }
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

/**
 * @param {import("../view/view.js").default} view
 * @param {ViewDebugSnapshotOptions} options
 * @returns {Record<string, EncodingDebugNode>}
 */
function getEncodings(view, options) {
    const encodingProvider =
        /** @type {{ mark?: { encoding?: Record<string, any> } }} */ (
            /** @type {unknown} */ (view)
        );
    const encoding = encodingProvider.mark?.encoding ?? view.getEncoding();
    /** @type {Record<string, EncodingDebugNode>} */
    const encodings = {};

    for (const [channel, channelDef] of Object.entries(encoding)) {
        if (!channelDef) {
            continue;
        }

        encodings[channel] = {
            channel,
            field: "field" in channelDef ? channelDef.field : undefined,
            expr: "expr" in channelDef ? channelDef.expr : undefined,
            value: "value" in channelDef ? channelDef.value : undefined,
            type: "type" in channelDef ? channelDef.type : undefined,
            scaleResolutionId: getChannelResolutionId(
                view.resolutions.scale,
                channel,
                options
            ),
            axisResolutionId: getChannelResolutionId(
                view.resolutions.axis,
                channel,
                options
            ),
            legendResolutionId: getChannelResolutionId(
                view.resolutions.legend,
                channel,
                options
            ),
            channelDef: structuredClone(channelDef),
        };
    }

    return encodings;
}

/**
 * @param {Record<string, any>} resolutions
 * @param {string} channel
 * @param {ViewDebugSnapshotOptions} options
 * @returns {string | undefined}
 */
function getChannelResolutionId(resolutions, channel, options) {
    const resolution = resolutions[channel];
    return resolution
        ? options.getDebugId(/** @type {object} */ (resolution))
        : undefined;
}
