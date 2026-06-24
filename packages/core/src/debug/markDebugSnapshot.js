import ContainerView from "../view/containerView.js";
import { getEncodingSearchFields } from "../encoder/metadataChannels.js";
import { previewValue } from "./valuePreview.js";

/**
 * @typedef {object} MarkDebugSnapshotOptions
 * @prop {(object: object) => string} getDebugId
 */

/**
 * @typedef {object} MarkDebugSnapshot
 * @prop {MarkDebugNode[]} marks
 */

/**
 * @typedef {object} MarkDebugNode
 * @prop {string} viewId
 * @prop {string} viewPath
 * @prop {string} type
 * @prop {boolean} ready
 * @prop {boolean} pickingParticipant
 * @prop {boolean} markUniformsAltered
 * @prop {string[]} encodingChannels
 * @prop {string[]} encoderChannels
 * @prop {string[]} searchFields
 * @prop {number | undefined} dataCount
 * @prop {number | undefined} vertexCount
 * @prop {number | undefined} allocatedVertices
 * @prop {number} rangeCount
 * @prop {Record<string, any>} properties
 */

/**
 * @param {import("../view/view.js").default | undefined} root
 * @param {MarkDebugSnapshotOptions} options
 * @returns {MarkDebugSnapshot}
 */
export function createMarkDebugSnapshot(root, options) {
    if (!root) {
        return { marks: [] };
    }

    /** @type {MarkDebugNode[]} */
    const marks = [];

    visitViews(root, (view) => {
        const mark =
            /** @type {{ mark?: import("../marks/mark.js").default }} */ (
                /** @type {unknown} */ (view)
            ).mark;
        if (!mark) {
            return;
        }

        const state = mark.getDebugState();
        marks.push({
            viewId: options.getDebugId(view),
            viewPath: view.getPathString(),
            type: mark.getType(),
            ready: Boolean(mark.isReady()),
            pickingParticipant: mark.isPickingParticipant(),
            markUniformsAltered: state.markUniformsAltered,
            encodingChannels: Object.keys(mark.encoding),
            encoderChannels: mark.encoders ? Object.keys(mark.encoders) : [],
            searchFields: getEncodingSearchFields(view.getEncoding()) ?? [],
            dataCount: getDataCount(view),
            vertexCount: state.vertexCount,
            allocatedVertices: state.allocatedVertices,
            rangeCount: mark.rangeMap.size,
            properties: previewValue(state.properties),
        });
    });

    return { marks };
}

/**
 * @param {import("../view/view.js").default} root
 * @param {(view: import("../view/view.js").default) => void} visitor
 */
function visitViews(root, visitor) {
    visitor(root);
    if (root instanceof ContainerView) {
        for (const child of root) {
            visitViews(child, visitor);
        }
    }
}

/**
 * @param {import("../view/view.js").default} view
 * @returns {number | undefined}
 */
function getDataCount(view) {
    const collector =
        /** @type {{ getCollector?: () => import("../data/collector.js").default | undefined }} */ (
            /** @type {unknown} */ (view)
        ).getCollector?.();
    return collector?.getItemCount();
}
