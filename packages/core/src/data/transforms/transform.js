import FlowNode from "../flowNode.js";

export default class Transform extends FlowNode {
    /** @type {string} */
    #label;

    /**
     * @param {import("../../spec/transform.js").TransformParamsBase} params
     * @param {import("../flowNode.js").ParamMediatorProvider} [paramMediatorProvider]
     */
    constructor(params, paramMediatorProvider) {
        super(paramMediatorProvider);
        this.#label = params.type;
    }

    /**
     * @returns {string}
     */
    get label() {
        return this.#label;
    }
}
