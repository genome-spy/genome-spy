import View from "./view";

/**
 * This is just a placeholder for custom tracks that are imported by name.
 */
export default class ImportView extends View {
    /**
     *
     * @param {import("../spec/view").ImportSpec} spec
     * @param {import("./viewUtils").ViewContext} context
     * @param {import("./view").default} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name);

        this.spec = spec; // Set here again to keep types happy
    }
}
