import { getViewClass } from "./viewUtils";
import ContainerView from "./containerView";

/**
 *
 * @typedef {import("./view").default} View
 */
export default class TableRowView extends ContainerView {
    constructor() {
        super(null, null, null, null);

        /** @type {View} */
        this.center = undefined;

        /** @type {ContainerView} */
        this.left = undefined;

        /** @type {ContainerView} */
        this.right = undefined;
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        yield this.center;

        if (this.left) {
            yield this.left;
        }

        if (this.center) {
            yield this.center;
        }
    }

    /**
     * @param {string} channel
     */
    getDefaultResolution(channel) {
        return channel == "y" ? "shared" : "independent";
    }
}
