import View from "./view";

/**
 * Compositor view represents a non-leaf node in the view hierarchy.
 */
export default class ContainerView extends View {
    
    /**
     * 
     * @param {import("./view").Spec} spec
     * @param {import("./view").ViewContext} context 
     * @param {import("./view").default} parent 
     * @param {string} name 
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name);
    }

    /**
     * @param {string} channel
     */
    getConfiguredOrDefaultResolution(channel) {
        return this.spec.resolve && this.spec.resolve.scale && this.spec.resolve.scale[channel] || "shared";
    }
}