import { getViewClass } from "./viewUtils";
import ContainerView from "./containerView";

/**
 * @typedef {import("./view").default} View 
 */
export default class LayerView extends ContainerView { 

    /**
     * 
     * @param {import("./viewUtils").LayerSpec} spec
     * @param {import("./viewUtils").ViewContext} context 
     * @param {View} parent
     * @param {string} name 
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name)

        // TODO: "subviews" that may be layered or stacked (concatenated) vertically
        /** @type { View[] } */
        this.children = (spec.layer || [])
            .map((childSpec, i) => {
                const View = getViewClass(childSpec);
                return new View(childSpec, context, this, "layer" + i);
            });
    }

}