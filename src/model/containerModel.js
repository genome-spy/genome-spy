import Model from "./model";

/**
 * Compositor model represents a non-leaf node in the view hierarchy.
 */
export default class ContainerModel extends Model {
    
    /**
     * 
     * @param {*} context 
     * @param {Model} parent 
     * @param {string} name 
     * @param {import("./model").Spec} spec
     */
    constructor(context, parent, name, spec) {
        super(context, parent, name, spec);
    }

    getConfiguredOrDefaultResolution(channel) {
        return this.spec.resolve && this.spec.resolve.scale && this.spec.resolve.scale[channel] || "shared";
    }
}