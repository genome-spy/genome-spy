import FlowNode from "../flowNode.js";

export default class Transform extends FlowNode {
    /** @type {string} */
    #label;

    /**
     * @param {import("../../spec/transform.js").TransformParamsBase} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} [paramRuntimeProvider]
     */
    constructor(params, paramRuntimeProvider) {
        super(paramRuntimeProvider);
        this.#label = params.type;
    }

    /**
     * @returns {string}
     */
    get label() {
        return this.#label;
    }
}
