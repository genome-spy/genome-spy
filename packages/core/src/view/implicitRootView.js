import GridView from "./gridView.js";

export default class ImplicitRootView extends GridView {
    /**
     * @param {import("../types/viewContext").default} context
     * @param {import("./view").default} view
     */
    constructor(context, view) {
        super(
            { vconcat: [] },
            context,
            undefined,
            undefined,
            "implicitRoot",
            1
        );

        view.layoutParent = this;
        view.dataParent = this;

        this.appendChild(view);
    }
}
