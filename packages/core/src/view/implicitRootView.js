import GridView from "./gridView.js";

export default class ImplicitRootView extends GridView {
    /**
     * @param {import("../types/viewContext").default} context
     * @param {import("./view").default} view
     * @param {import("./view").ViewOptions} [options]
     */
    constructor(context, view, options) {
        super(
            { vconcat: [] },
            context,
            undefined,
            undefined,
            "implicitRoot",
            1,
            options
        );

        view.layoutParent = this;
        view.dataParent = this;

        this.appendChild(view);
    }
}
