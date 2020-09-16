import { getViewClass } from "./viewUtils";
import ContainerView from "./containerView";
import TableRowView from "./tableRowView";

/**
 *
 * @typedef {import("./view").default} View
 */
export default class TableView extends ContainerView {
    /**
     *
     * @param {import("./viewUtils").LayerSpec} spec
     * @param {import("./viewUtils").ViewContext} context
     * @param {View} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name);

        /** @type {TableRowView[]} */
        this.rows = [];
    }

    /**
     * @param {string} channel
     */
    getDefaultResolution(channel) {
        return channel == "y" ? "shared" : "independent";
    }
}
