import { getViewClass } from "./viewUtils";
import ContainerView from "./containerView";

/**
 *
 * @typedef {import("./view").default} View
 */
export default class VConcatView extends ContainerView {
    /**
     *
     * @param {import("./viewUtils").ConcatSpec} spec
     * @param {import("./viewUtils").ViewContext} context
     * @param {View} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name);

        /** @type { View[] } */
        this.children = (spec.concat || []).map((childSpec, i) => {
            const View = getViewClass(childSpec);
            return new View(childSpec, context, this, "vconcat" + i);
        });
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        for (const child of this.children) {
            yield child;
        }
    }

    /**
     * @param {string} channel
     */
    getDefaultResolution(channel) {
        return channel == "x" ? "shared" : "independent";
    }
}
