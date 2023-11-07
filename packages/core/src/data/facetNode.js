import FlowNode from "./flowNode.js";

/**
 * @typedef {object} FacetParams
 * @prop {string[]} groupby
 */
export default class FacetNode extends FlowNode {
    /**
     * @param {FacetParams} params
     */
    constructor(params) {
        super();

        /** @type {Map<any | any[], FlowNode>} */
        this.subflows = new Map();
    }
}
