import GridView from "./gridView";

export default class ImplicitRootView extends GridView {
    /**
     * @param {import("./viewUtils").ViewContext} context
     * @param {import("./view").default} view
     */
    constructor(context, view) {
        super({ vconcat: [] }, context, undefined, "implicitRoot", 1);

        view.parent = this;
        this.appendChild(view);
    }
}
