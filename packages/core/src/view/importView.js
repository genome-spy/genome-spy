import View from "./view";

/**
 * This is just a placeholder for custom tracks that are imported by name.
 */
// @ts-expect-error TODO: Fix typing
export default class ImportView extends View {
    /**
     *
     * @param {import("../spec/view").ImportSpec} spec
     * @param {import("../types/viewContext").default} context
     * @param {import("./containerView").default} layoutParent
     * @param {import("./view").default} dataParent
     * @param {string} name
     */
    constructor(spec, context, layoutParent, dataParent, name) {
        // @ts-expect-error TODO: Fix typing
        super(spec, context, layoutParent, dataParent, name);

        this.spec = spec; // Set here again to keep types happy
    }
}
