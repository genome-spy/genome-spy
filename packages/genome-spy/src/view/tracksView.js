import { getViewClass } from "./viewUtils";
import ContainerView from "./containerView";

/**
 *
 * @typedef {import("./view").default} View
 */
export default class TracksView extends ContainerView {
    /**
     *
     * @param {import("./viewUtils").TracksSpec} spec
     * @param {import("./viewUtils").ViewContext} context
     * @param {View} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name);

        /** @type { View[] } */
        this.children = (spec.tracks || []).map((childSpec, i) => {
            const View = getViewClass(childSpec);
            return new View(childSpec, context, this, "tracks" + i);
        });
    }

    /**
     * @param {string} channel
     */
    getDefaultResolution(channel) {
        return channel == "x" ? "shared" : "independent";
    }
}
