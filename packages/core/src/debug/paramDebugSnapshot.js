import ContainerView from "../view/containerView.js";
import { previewValue } from "./valuePreview.js";

/**
 * @typedef {object} ParamDebugSnapshotOptions
 * @prop {(object: object) => string} getDebugId
 */

/**
 * @typedef {object} ParamDebugSnapshot
 * @prop {ParamScopeDebugNode[]} scopes
 */

/**
 * @typedef {object} ParamScopeDebugNode
 * @prop {string} viewId
 * @prop {string} viewPath
 * @prop {string} scopeId
 * @prop {boolean} disposed
 * @prop {ParamDebugNode[]} params
 */

/**
 * @typedef {object} ParamDebugNode
 * @prop {string} name
 * @prop {"auto" | "base" | "derived" | "selection" | "ruler" | "push"} kind
 * @prop {any} value
 * @prop {boolean} writable
 * @prop {boolean} configured
 * @prop {Record<string, any> | undefined} config
 */

/**
 * @param {import("../view/view.js").default | undefined} root
 * @param {ParamDebugSnapshotOptions} options
 * @returns {ParamDebugSnapshot}
 */
export function createParamDebugSnapshot(root, options) {
    if (!root) {
        return { scopes: [] };
    }

    /** @type {ParamScopeDebugNode[]} */
    const scopes = [];

    visitViews(root, (view) => {
        const state = view.paramRuntime.getDebugState();
        scopes.push({
            viewId: options.getDebugId(view),
            viewPath: view.getPathString(),
            scopeId: state.scopeId,
            disposed: state.disposed,
            params: state.params.map(
                /**
                 * @param {import("../paramRuntime/viewParamRuntime.js").ViewParamDebugState} param
                 * @returns {ParamDebugNode}
                 */
                (param) => ({
                    name: param.name,
                    kind: param.kind,
                    value: previewValue(param.value),
                    writable: param.writable,
                    configured: param.configured,
                    config: param.config
                        ? previewValue(param.config)
                        : undefined,
                })
            ),
        });
    });

    return { scopes };
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
